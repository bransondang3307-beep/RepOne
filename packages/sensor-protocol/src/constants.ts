/**
 * IMU stream protocol v1 — wire constants (ADR 0008, docs/protocols/imu-stream-v1.md).
 * All multi-byte fields are little-endian. Firmware mirrors these values in firmware/lib/imu_protocol.
 */

export const PROTOCOL_VERSION = 1;

/** Second byte of every packet. */
export const PacketType = {
  /** A batch of IMU samples from one channel (BLE notification, or an `S` line over USB). */
  Samples: 0x01,
  /** The device's identity, configuration and status (BLE read/notify, or an `I` line over USB). */
  DeviceInfo: 0x02,
} as const;

/** Bits of a sample packet's `flags` byte. Every other bit is reserved and must be 0. */
export const SampleFlag = {
  /** First packet of a stream: the device (re)started streaming with a new stream id, sequence 0. */
  StreamStart: 0x01,
  /** The device dropped samples before this packet (its buffer overflowed). */
  DeviceOverflow: 0x02,
} as const;
export const KNOWN_SAMPLE_FLAGS = SampleFlag.StreamStart | SampleFlag.DeviceOverflow;

export const SAMPLE_HEADER_BYTES = 10;
/** u32 device time + six i16 raw axes. */
export const SAMPLE_BYTES = 16;
export const CRC_BYTES = 2;
export const MAX_SAMPLES_PER_PACKET = 31;
/** 508 bytes: within the 512-byte limit of an ATT attribute value. */
export const MAX_SAMPLE_PACKET_BYTES = SAMPLE_HEADER_BYTES + SAMPLE_BYTES * MAX_SAMPLES_PER_PACKET + CRC_BYTES;
/** Fits a default (23-byte) ATT MTU, so it can always be read. */
export const DEVICE_INFO_BYTES = 20;
/** Channel index is 4 bits. */
export const MAX_CHANNELS = 16;

/** ATT notification header: a notification carries at most MTU − 3 bytes. */
export const ATT_NOTIFICATION_OVERHEAD_BYTES = 3;
export const MIN_MTU_FOR_ONE_SAMPLE = ATT_NOTIFICATION_OVERHEAD_BYTES + SAMPLE_HEADER_BYTES + SAMPLE_BYTES + CRC_BYTES;

/** Largest sample count whose packet fits one notification at this negotiated ATT MTU (0 = not even one). */
export function maxSamplesForMtu(mtu: number): number {
  if (!Number.isInteger(mtu) || mtu < 0) throw new RangeError(`invalid ATT MTU: ${mtu}`);
  const room = mtu - ATT_NOTIFICATION_OVERHEAD_BYTES - SAMPLE_HEADER_BYTES - CRC_BYTES;
  return Math.max(0, Math.min(MAX_SAMPLES_PER_PACKET, Math.floor(room / SAMPLE_BYTES)));
}

/** Device status byte in the device-info packet. Unknown non-zero values are errors too. */
export const DeviceStatus = {
  Ok: 0,
  /** The IMU did not answer at start-up (no I²C acknowledge, or an unexpected WHO_AM_I). */
  ImuNotFound: 1,
  /** An I²C read failed while streaming. */
  ImuReadFailed: 2,
  /** The negotiated ATT MTU cannot carry one sample packet; the device does not stream. */
  MtuTooSmall: 3,
} as const;

/**
 * GATT identifiers. Random 128-bit UUIDs (version 4), brand-neutral (ADR 0006): discovery matches these, never a
 * device or product name.
 */
export const BLE_UUIDS = {
  service: '19bc0001-bab5-4ddb-8e9c-8595137ac300',
  /** Notify: sample packets. Enabling notifications starts a stream; disabling or disconnecting stops it. */
  samples: '19bc0002-bab5-4ddb-8e9c-8595137ac300',
  /** Read and notify: the device-info packet; notified again whenever the status byte changes. */
  deviceInfo: '19bc0003-bab5-4ddb-8e9c-8595137ac300',
} as const;
