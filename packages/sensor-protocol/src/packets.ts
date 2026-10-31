import {
  CRC_BYTES,
  DEVICE_INFO_BYTES,
  KNOWN_SAMPLE_FLAGS,
  MAX_CHANNELS,
  MAX_SAMPLES_PER_PACKET,
  PROTOCOL_VERSION,
  PacketType,
  SAMPLE_BYTES,
  SAMPLE_HEADER_BYTES,
  SampleFlag,
} from './constants';
import { crc16CcittFalse } from './crc16';
import { INT16_MAX, INT16_MIN, isFullScaleCode, type FullScaleCode } from './units';

/** One IMU reading as it travels on the wire: device time and raw register counts, no units applied. */
export interface WireImuSample {
  /** Device clock, milliseconds since the device booted. u32: wraps after 2^32 ms (about 49.7 days). */
  readonly deviceTimeMs: number;
  /** Raw accelerometer counts x, y, z (signed 16-bit), in the IMU's own axis order and frame. */
  readonly accel: readonly [number, number, number];
  /** Raw gyroscope counts x, y, z (signed 16-bit). */
  readonly gyro: readonly [number, number, number];
}

export interface SamplePacket {
  readonly type: 'samples';
  readonly streamStart: boolean;
  readonly deviceOverflow: boolean;
  readonly accelRange: FullScaleCode;
  readonly gyroRange: FullScaleCode;
  /** IMU index on the device, 0–15. */
  readonly channel: number;
  /** Chosen by the device each time it starts streaming (u16). */
  readonly streamId: number;
  /** Sequence number of the first sample (u16, wraps); sample i has firstSequence + i. */
  readonly firstSequence: number;
  readonly samples: readonly WireImuSample[];
}

export interface DeviceInfoPacket {
  readonly type: 'device_info';
  /** 64-bit hardware identity as 16 lowercase hex digits, most significant byte first. Never all zeros. */
  readonly deviceSerial: string;
  readonly channelCount: number;
  readonly accelRange: FullScaleCode;
  readonly gyroRange: FullScaleCode;
  readonly nominalRateHz: number;
  readonly firmwareVersion: { readonly major: number; readonly minor: number };
  /** `DeviceStatus` value; any non-zero value is an error. */
  readonly status: number;
}

export type Packet = SamplePacket | DeviceInfoPacket;

export type DecodeErrorCode =
  | 'truncated'
  | 'length_mismatch'
  | 'unsupported_version'
  | 'unknown_packet_type'
  | 'bad_checksum'
  | 'bad_sample_count'
  | 'reserved_bits_set'
  | 'invalid_field';

export interface DecodeError {
  readonly code: DecodeErrorCode;
  readonly message: string;
}

export type DecodeResult = { readonly ok: true; readonly packet: Packet } | { readonly ok: false; readonly error: DecodeError };

const fail = (code: DecodeErrorCode, message: string): DecodeResult => ({ ok: false, error: { code, message } });

export function samplePacketBytes(sampleCount: number): number {
  return SAMPLE_HEADER_BYTES + SAMPLE_BYTES * sampleCount + CRC_BYTES;
}

/**
 * Decode one packet: a whole BLE notification or read value, or the bytes of one USB line. Validation order:
 * version, type, length, checksum, then fields, so a future version is reported as unsupported rather than corrupt.
 */
export function decodePacket(bytes: Uint8Array): DecodeResult {
  if (bytes.length < 2) return fail('truncated', `${bytes.length} bytes is shorter than any packet`);
  if (bytes[0] !== PROTOCOL_VERSION) return fail('unsupported_version', `protocol version ${bytes[0]}; this app reads ${PROTOCOL_VERSION}`);
  if (bytes[1] === PacketType.Samples) return decodeSamples(bytes);
  if (bytes[1] === PacketType.DeviceInfo) return decodeDeviceInfo(bytes);
  return fail('unknown_packet_type', `packet type 0x${bytes[1]!.toString(16).padStart(2, '0')}`);
}

function checksumOk(bytes: Uint8Array): boolean {
  const end = bytes.length - CRC_BYTES;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint16(end, true) === crc16CcittFalse(bytes, end);
}

function decodeSamples(bytes: Uint8Array): DecodeResult {
  if (bytes.length < SAMPLE_HEADER_BYTES) return fail('truncated', `sample packet header needs ${SAMPLE_HEADER_BYTES} bytes, got ${bytes.length}`);
  const count = bytes[8]!;
  if (count < 1 || count > MAX_SAMPLES_PER_PACKET) return fail('bad_sample_count', `sample count ${count}; allowed 1–${MAX_SAMPLES_PER_PACKET}`);
  const expected = samplePacketBytes(count);
  if (bytes.length < expected) return fail('truncated', `${count} samples need ${expected} bytes, got ${bytes.length}`);
  if (bytes.length > expected) return fail('length_mismatch', `${count} samples need ${expected} bytes, got ${bytes.length}`);
  if (!checksumOk(bytes)) return fail('bad_checksum', 'CRC-16 does not match');
  const flags = bytes[2]!;
  if (flags & ~KNOWN_SAMPLE_FLAGS || bytes[9] !== 0) return fail('reserved_bits_set', 'reserved flag bits or reserved byte are not 0');
  const config = bytes[3]!;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples: WireImuSample[] = [];
  for (let i = 0; i < count; i++) {
    const at = SAMPLE_HEADER_BYTES + i * SAMPLE_BYTES;
    const axis = (k: number) => view.getInt16(at + 4 + 2 * k, true);
    samples.push({
      deviceTimeMs: view.getUint32(at, true),
      accel: [axis(0), axis(1), axis(2)],
      gyro: [axis(3), axis(4), axis(5)],
    });
  }
  return {
    ok: true,
    packet: {
      type: 'samples',
      streamStart: (flags & SampleFlag.StreamStart) !== 0,
      deviceOverflow: (flags & SampleFlag.DeviceOverflow) !== 0,
      accelRange: (config & 0x03) as FullScaleCode,
      gyroRange: ((config >> 2) & 0x03) as FullScaleCode,
      channel: config >> 4,
      streamId: view.getUint16(4, true),
      firstSequence: view.getUint16(6, true),
      samples,
    },
  };
}

function decodeDeviceInfo(bytes: Uint8Array): DecodeResult {
  if (bytes.length < DEVICE_INFO_BYTES) return fail('truncated', `device info needs ${DEVICE_INFO_BYTES} bytes, got ${bytes.length}`);
  if (bytes.length > DEVICE_INFO_BYTES) return fail('length_mismatch', `device info needs ${DEVICE_INFO_BYTES} bytes, got ${bytes.length}`);
  if (!checksumOk(bytes)) return fail('bad_checksum', 'CRC-16 does not match');
  const config = bytes[11]!;
  if (config & 0xf0 || bytes[17] !== 0) return fail('reserved_bits_set', 'reserved config bits or reserved byte are not 0');
  const serialBytes = bytes.subarray(2, 10);
  if (serialBytes.every((b) => b === 0)) return fail('invalid_field', 'device serial is all zeros (unconfigured device)');
  const channelCount = bytes[10]!;
  if (channelCount < 1 || channelCount > MAX_CHANNELS) return fail('invalid_field', `channel count ${channelCount}; allowed 1–${MAX_CHANNELS}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nominalRateHz = view.getUint16(12, true);
  if (nominalRateHz === 0) return fail('invalid_field', 'nominal sample rate is 0 Hz');
  return {
    ok: true,
    packet: {
      type: 'device_info',
      deviceSerial: Array.from(serialBytes, (b) => b.toString(16).padStart(2, '0')).join(''),
      channelCount,
      accelRange: (config & 0x03) as FullScaleCode,
      gyroRange: ((config >> 2) & 0x03) as FullScaleCode,
      nominalRateHz,
      firmwareVersion: { major: bytes[14]!, minor: bytes[15]! },
      status: bytes[16]!,
    },
  };
}

function checkUint(name: string, value: number, max: number): void {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new RangeError(`${name} must be an integer 0–${max}, got ${value}`);
}

function checkInt16(name: string, value: number): void {
  if (!Number.isInteger(value) || value < INT16_MIN || value > INT16_MAX) throw new RangeError(`${name} must be a signed 16-bit integer, got ${value}`);
}

function checkRange(name: string, value: number): void {
  if (!isFullScaleCode(value)) throw new RangeError(`${name} must be a full-scale code 0–3, got ${value}`);
}

/** Encode a sample packet. Used by tests and simulation; the firmware has its own encoder and must match it. */
export function encodeSamplePacket(packet: Omit<SamplePacket, 'type'>): Uint8Array {
  const count = packet.samples.length;
  if (count < 1 || count > MAX_SAMPLES_PER_PACKET) throw new RangeError(`sample count must be 1–${MAX_SAMPLES_PER_PACKET}, got ${count}`);
  checkRange('accelRange', packet.accelRange);
  checkRange('gyroRange', packet.gyroRange);
  checkUint('channel', packet.channel, MAX_CHANNELS - 1);
  checkUint('streamId', packet.streamId, 0xffff);
  checkUint('firstSequence', packet.firstSequence, 0xffff);
  const bytes = new Uint8Array(samplePacketBytes(count));
  const view = new DataView(bytes.buffer);
  bytes[0] = PROTOCOL_VERSION;
  bytes[1] = PacketType.Samples;
  bytes[2] = (packet.streamStart ? SampleFlag.StreamStart : 0) | (packet.deviceOverflow ? SampleFlag.DeviceOverflow : 0);
  bytes[3] = packet.accelRange | (packet.gyroRange << 2) | (packet.channel << 4);
  view.setUint16(4, packet.streamId, true);
  view.setUint16(6, packet.firstSequence, true);
  bytes[8] = count;
  packet.samples.forEach((s, i) => {
    const at = SAMPLE_HEADER_BYTES + i * SAMPLE_BYTES;
    checkUint(`samples[${i}].deviceTimeMs`, s.deviceTimeMs, 0xffffffff);
    view.setUint32(at, s.deviceTimeMs, true);
    [...s.accel, ...s.gyro].forEach((v, k) => {
      checkInt16(`samples[${i}] axis ${k}`, v);
      view.setInt16(at + 4 + 2 * k, v, true);
    });
  });
  view.setUint16(bytes.length - CRC_BYTES, crc16CcittFalse(bytes, bytes.length - CRC_BYTES), true);
  return bytes;
}

export function encodeDeviceInfo(packet: Omit<DeviceInfoPacket, 'type'>): Uint8Array {
  if (!/^[0-9a-f]{16}$/.test(packet.deviceSerial) || /^0+$/.test(packet.deviceSerial)) {
    throw new RangeError(`deviceSerial must be 16 lowercase hex digits, not all zeros, got ${packet.deviceSerial}`);
  }
  checkUint('channelCount', packet.channelCount, MAX_CHANNELS);
  if (packet.channelCount < 1) throw new RangeError('channelCount must be at least 1');
  checkRange('accelRange', packet.accelRange);
  checkRange('gyroRange', packet.gyroRange);
  checkUint('nominalRateHz', packet.nominalRateHz, 0xffff);
  if (packet.nominalRateHz < 1) throw new RangeError('nominalRateHz must be at least 1');
  checkUint('firmwareVersion.major', packet.firmwareVersion.major, 0xff);
  checkUint('firmwareVersion.minor', packet.firmwareVersion.minor, 0xff);
  checkUint('status', packet.status, 0xff);
  const bytes = new Uint8Array(DEVICE_INFO_BYTES);
  const view = new DataView(bytes.buffer);
  bytes[0] = PROTOCOL_VERSION;
  bytes[1] = PacketType.DeviceInfo;
  for (let i = 0; i < 8; i++) bytes[2 + i] = parseInt(packet.deviceSerial.slice(2 * i, 2 * i + 2), 16);
  bytes[10] = packet.channelCount;
  bytes[11] = packet.accelRange | (packet.gyroRange << 2);
  view.setUint16(12, packet.nominalRateHz, true);
  bytes[14] = packet.firmwareVersion.major;
  bytes[15] = packet.firmwareVersion.minor;
  bytes[16] = packet.status;
  view.setUint16(DEVICE_INFO_BYTES - CRC_BYTES, crc16CcittFalse(bytes, DEVICE_INFO_BYTES - CRC_BYTES), true);
  return bytes;
}
