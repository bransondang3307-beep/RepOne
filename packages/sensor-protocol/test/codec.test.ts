import {
  BLE_UUIDS,
  MAX_SAMPLE_PACKET_BYTES,
  MAX_SAMPLES_PER_PACKET,
  MIN_MTU_FOR_ONE_SAMPLE,
  accelRawToMS2,
  bytesToHex,
  crc16CcittFalse,
  decodePacket,
  encodeDeviceInfo,
  encodeSamplePacket,
  gyroRawToRadS,
  maxSamplesForMtu,
  samplePacketBytes,
  type DeviceInfoPacket,
  type FullScaleCode,
  type SamplePacket,
} from '../src';
import { golden, goldenValid, hex } from './fixtures';

describe('CRC-16/CCITT-FALSE', () => {
  it('matches the standard check value', () => {
    expect(crc16CcittFalse(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });
});

describe('golden packets (synthetic fixtures shared with the firmware)', () => {
  it.each(golden.valid.map((v) => [v.name, v] as const))('%s: decodes to its fields and re-encodes to the same bytes', (_name, entry) => {
    const decoded = decodePacket(hex(entry.hex));
    expect(decoded).toEqual({ ok: true, packet: { type: entry.type, ...entry.fields } });
    if (!decoded.ok) return;
    const { type: _type, ...fields } = decoded.packet;
    const encoded =
      decoded.packet.type === 'samples'
        ? encodeSamplePacket(fields as Omit<SamplePacket, 'type'>)
        : encodeDeviceInfo(fields as Omit<DeviceInfoPacket, 'type'>);
    expect(bytesToHex(encoded)).toBe(entry.hex);
  });

  it.each(golden.invalid.map((v) => [v.name, v] as const))('%s: rejected as %s', (_name, entry) => {
    const decoded = decodePacket(hex(entry.hex));
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error.code).toBe(entry.error);
  });

  it('documents its first packet byte by byte (the protocol document shows the same breakdown)', () => {
    expect(goldenValid('samples-stream-start-1').hex).toBe(
      '01' + '01' + '01' + '00' + '3412' + '0000' + '01' + '00' + 'e8030000' + '0000' + '0000' + '0040' + '8300' + '7dff' + '0000' + '5218',
    );
  });
});

describe('truncation and corruption', () => {
  it('rejects every proper prefix of a valid packet, never mistaking it for a shorter valid one', () => {
    for (const entry of golden.valid) {
      const bytes = hex(entry.hex);
      for (let len = 0; len < bytes.length; len++) {
        const decoded = decodePacket(bytes.subarray(0, len));
        expect(decoded.ok).toBe(false);
      }
    }
  });

  it('detects any single flipped bit in a sample packet', () => {
    const bytes = hex(goldenValid('samples-mid-stream-5').hex);
    for (let i = 0; i < bytes.length * 8; i++) {
      const copy = bytes.slice();
      copy[i >> 3]! ^= 1 << (i & 7);
      expect(decodePacket(copy).ok).toBe(false);
    }
  });

  it('decodes from a view into a larger buffer (as native modules may hand over)', () => {
    const bytes = hex(goldenValid('samples-stream-start-1').hex);
    const padded = new Uint8Array(bytes.length + 7);
    padded.set(bytes, 5);
    expect(decodePacket(padded.subarray(5, 5 + bytes.length)).ok).toBe(true);
  });
});

describe('explicit unit conversion (raw counts → contract units)', () => {
  it.each(golden.conversions.map((c) => [JSON.stringify(c), c] as const))('%s', (_label, c) => {
    if (c.accel_m_s2 !== undefined) expect(accelRawToMS2(c.raw, c.accelRange as FullScaleCode)).toBeCloseTo(c.accel_m_s2, 12);
    if (c.gyro_rad_s !== undefined) expect(gyroRawToRadS(c.raw, c.gyroRange as FullScaleCode)).toBeCloseTo(c.gyro_rad_s, 12);
  });

  it('is linear and sign-preserving', () => {
    expect(accelRawToMS2(-16384, 0)).toBeCloseTo(-9.80665, 12);
    expect(accelRawToMS2(0, 2)).toBe(0);
    expect(gyroRawToRadS(-131, 0)).toBeCloseTo(-Math.PI / 180, 12);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, 32768, -32769])('rejects the invalid raw value %p', (raw) => {
    expect(() => accelRawToMS2(raw, 0)).toThrow(RangeError);
    expect(() => gyroRawToRadS(raw, 0)).toThrow(RangeError);
  });

  it('rejects an invalid full-scale code', () => {
    expect(() => accelRawToMS2(1, 4 as FullScaleCode)).toThrow(RangeError);
    expect(() => gyroRawToRadS(1, -1 as FullScaleCode)).toThrow(RangeError);
  });
});

describe('payload size limits and MTU', () => {
  const sample = { deviceTimeMs: 0, accel: [0, 0, 0] as const, gyro: [0, 0, 0] as const };
  const base = { streamStart: false, deviceOverflow: false, accelRange: 0, gyroRange: 0, channel: 0, streamId: 1, firstSequence: 0 } as const;

  it('encodes 1–31 samples and refuses 0 or 32', () => {
    expect(encodeSamplePacket({ ...base, samples: Array(MAX_SAMPLES_PER_PACKET).fill(sample) })).toHaveLength(MAX_SAMPLE_PACKET_BYTES);
    expect(MAX_SAMPLE_PACKET_BYTES).toBe(508);
    expect(() => encodeSamplePacket({ ...base, samples: [] })).toThrow(RangeError);
    expect(() => encodeSamplePacket({ ...base, samples: Array(32).fill(sample) })).toThrow(RangeError);
  });

  it('sizes packets as 12 + 16 per sample', () => {
    expect(samplePacketBytes(1)).toBe(28);
    expect(samplePacketBytes(10)).toBe(172);
  });

  it.each([
    [23, 0],
    [MIN_MTU_FOR_ONE_SAMPLE - 1, 0],
    [MIN_MTU_FOR_ONE_SAMPLE, 1],
    [185, 10],
    [247, 14],
    [517, 31],
  ])('ATT MTU %i carries %i samples per notification', (mtu, n) => {
    expect(maxSamplesForMtu(mtu)).toBe(n);
    if (n > 0) expect(samplePacketBytes(n)).toBeLessThanOrEqual(mtu - 3);
  });

  it('refuses out-of-range header and sample fields instead of truncating them', () => {
    expect(() => encodeSamplePacket({ ...base, channel: 16, samples: [sample] })).toThrow(RangeError);
    expect(() => encodeSamplePacket({ ...base, streamId: 0x10000, samples: [sample] })).toThrow(RangeError);
    expect(() => encodeSamplePacket({ ...base, samples: [{ ...sample, deviceTimeMs: 2 ** 32 }] })).toThrow(RangeError);
    expect(() => encodeSamplePacket({ ...base, samples: [{ ...sample, accel: [0, 0, 40000] }] })).toThrow(RangeError);
    expect(() => encodeSamplePacket({ ...base, samples: [{ ...sample, gyro: [0, Number.NaN, 0] }] })).toThrow(RangeError);
  });
});

describe('identifiers', () => {
  it('uses brand-neutral, distinct 128-bit UUIDs (ADR 0006)', () => {
    const ids = Object.values(BLE_UUIDS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
