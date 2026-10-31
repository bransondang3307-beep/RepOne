import { StreamTracker, decodePacket, encodeSamplePacket, type SamplePacket, type WireImuSample } from '../src';
import { goldenValid, hex } from './fixtures';

const sourceIdFor = (channel: number) => `imu-0000a1b2c3d4e5f6-ch${channel}`;
const tracker = () => new StreamTracker({ sourceIdFor });

function golden(name: string): SamplePacket {
  const decoded = decodePacket(hex(goldenValid(name).hex));
  if (!decoded.ok || decoded.packet.type !== 'samples') throw new Error(`${name} is not a sample packet`);
  return decoded.packet;
}

const wire = (deviceTimeMs: number, z = 16384): WireImuSample => ({ deviceTimeMs, accel: [0, 0, z], gyro: [0, 0, 0] });

function packet(overrides: Partial<SamplePacket> & Pick<SamplePacket, 'firstSequence' | 'samples'>): SamplePacket {
  return {
    type: 'samples',
    streamStart: false,
    deviceOverflow: false,
    accelRange: 0,
    gyroRange: 0,
    channel: 0,
    streamId: 0x1234,
    ...overrides,
  };
}

describe('StreamTracker', () => {
  it('turns a stream-start packet into contract samples: converted units, device time, source identity', () => {
    const t = tracker();
    const { samples, events } = t.accept(golden('samples-stream-start-1'));
    expect(events).toEqual([{ kind: 'stream_started', channel: 0, streamId: 0x1234 }]);
    expect(samples).toHaveLength(1);
    const [s] = samples;
    expect(s!.timestamp_ms).toBe(1000);
    expect(s!.source_id).toBe('imu-0000a1b2c3d4e5f6-ch0');
    expect(s!.accel_m_s2[0]).toBe(0);
    expect(s!.accel_m_s2[2]).toBeCloseTo(9.80665, 12);
    expect(s!.gyro_rad_s[0]).toBeCloseTo(Math.PI / 180, 12);
    expect(s!.gyro_rad_s[1]).toBeCloseTo(-Math.PI / 180, 12);
    expect(s!.quality_flags).toEqual([]);
  });

  it('delivers every sample of a multi-sample notification in order, without flags when nothing was lost', () => {
    const t = tracker();
    t.accept(golden('samples-stream-start-1'));
    const { samples, events } = t.accept(golden('samples-mid-stream-5'));
    expect(events).toEqual([]);
    expect(samples.map((s) => s.timestamp_ms)).toEqual([1020, 1040, 1060, 1080, 1100]);
    expect(samples.every((s) => s.quality_flags.length === 0)).toBe(true);
  });

  it('never labels decoded real-device data synthetic; provenance belongs to the source (ADR 0008)', () => {
    const t = tracker();
    const all = [...t.accept(golden('samples-stream-start-1')).samples, ...t.accept(golden('samples-mid-stream-5')).samples];
    expect(all.some((s) => s.quality_flags.includes('synthetic'))).toBe(false);
  });

  it('drops packets until a stream starts, and packets from another stream', () => {
    const t = tracker();
    expect(t.accept(golden('samples-mid-stream-5'))).toEqual({
      samples: [],
      events: [{ kind: 'stale_packet', channel: 0, streamId: 0x1234 }],
    });
    t.accept(golden('samples-stream-start-1'));
    const other = packet({ streamId: 0x9999, firstSequence: 1, samples: [wire(1020)] });
    expect(t.accept(other)).toEqual({ samples: [], events: [{ kind: 'stale_packet', channel: 0, streamId: 0x9999 }] });
  });

  it('detects lost samples from a sequence gap and flags the next sample', () => {
    const t = tracker();
    t.accept(packet({ streamStart: true, firstSequence: 0, samples: [wire(0)] }));
    const { samples, events } = t.accept(packet({ firstSequence: 4, samples: [wire(80), wire(100)] }));
    expect(events).toEqual([{ kind: 'samples_lost', channel: 0, count: 3 }]);
    expect(samples.map((s) => s.quality_flags)).toEqual([['sample_gap'], []]);
  });

  it('drops a repeated or out-of-order packet', () => {
    const t = tracker();
    t.accept(packet({ streamStart: true, firstSequence: 0, samples: [wire(0), wire(20)] }));
    t.accept(packet({ firstSequence: 2, samples: [wire(40)] }));
    const { samples, events } = t.accept(packet({ firstSequence: 1, samples: [wire(20)] }));
    expect(samples).toEqual([]);
    expect(events).toEqual([{ kind: 'duplicate_packet', channel: 0, firstSequence: 1 }]);
  });

  it('handles sequence and u32 device-clock wrap-around without gaps or decreasing timestamps', () => {
    const t = tracker();
    t.accept(packet({ streamStart: true, streamId: 0x0042, firstSequence: 65530, accelRange: 1, gyroRange: 2, samples: [wire(4294967200)] }));
    t.accept(packet({ streamId: 0x0042, firstSequence: 65531, accelRange: 1, gyroRange: 2, samples: [wire(4294967240), wire(4294967260), wire(4294967270)] }));
    const { samples, events } = t.accept(golden('samples-clock-and-sequence-wrap'));
    expect(events).toEqual([]);
    expect(samples.map((s) => s.timestamp_ms)).toEqual([4294967280, 4294967290, 2 ** 32 + 4]);
    expect(samples.every((s) => s.quality_flags.length === 0)).toBe(true);
  });

  it('drops a sample whose device time goes backwards (without a wrap) and flags the next one', () => {
    const t = tracker();
    t.accept(packet({ streamStart: true, firstSequence: 0, samples: [wire(1000)] }));
    const { samples, events } = t.accept(packet({ firstSequence: 1, samples: [wire(990), wire(1040)] }));
    expect(events).toEqual([{ kind: 'time_went_backwards', channel: 0, deviceTimeMs: 990 }]);
    expect(samples.map((s) => [s.timestamp_ms, s.quality_flags])).toEqual([[1040, ['sample_gap']]]);
  });

  it('flags the sample after a device-reported overflow', () => {
    const t = tracker();
    t.accept(packet({ streamStart: true, firstSequence: 0, samples: [wire(0)] }));
    t.accept(packet({ firstSequence: 1, samples: [wire(20), wire(40), wire(60), wire(80), wire(100)] }));
    const { samples, events } = t.accept(golden('samples-device-overflow'));
    expect(events).toEqual([{ kind: 'device_overflow', channel: 0 }]);
    expect(samples[0]!.quality_flags).toEqual(['sample_gap']);
  });

  it('marks readings at the converter limit as saturated and converts with the packet ranges', () => {
    const t = tracker();
    const [s] = t.accept(golden('samples-ranges-16g-2000dps-ch3')).samples;
    expect(s!.source_id).toBe('imu-0000a1b2c3d4e5f6-ch3');
    expect(s!.quality_flags).toEqual(['saturated']);
    expect(s!.accel_m_s2[0]).toBeCloseTo(9.80665, 12);
    expect(s!.gyro_rad_s[0]).toBeCloseTo((10 * Math.PI) / 180, 12);
  });

  it('reports a stream restart mid-run (e.g. the device rebooted) and follows the new stream', () => {
    const t = tracker();
    t.accept(golden('samples-stream-start-1'));
    const { samples, events } = t.accept(packet({ streamStart: true, streamId: 0x5555, firstSequence: 0, samples: [wire(12)] }));
    expect(events).toEqual([{ kind: 'stream_restarted', channel: 0, previousStreamId: 0x1234, streamId: 0x5555 }]);
    expect(samples.map((s) => s.timestamp_ms)).toEqual([12]);
    expect(t.currentStreamId(0)).toBe(0x5555);
  });

  it('after reset() (disconnect, reconnect) accepts nothing from before until a new stream starts', () => {
    const t = tracker();
    t.accept(golden('samples-stream-start-1'));
    t.reset();
    expect(t.currentStreamId(0)).toBeNull();
    expect(t.accept(golden('samples-mid-stream-5')).samples).toEqual([]);
    const restarted = t.accept(packet({ streamStart: true, streamId: 0x2222, firstSequence: 0, samples: [wire(3)] }));
    expect(restarted.events).toEqual([{ kind: 'stream_started', channel: 0, streamId: 0x2222 }]);
    expect(restarted.samples).toHaveLength(1);
  });

  it('keeps channels independent: a gap on one does not flag the other', () => {
    const t = tracker();
    t.accept(packet({ streamStart: true, channel: 0, firstSequence: 0, samples: [wire(0)] }));
    t.accept(packet({ streamStart: true, channel: 1, streamId: 0x1235, firstSequence: 0, samples: [wire(1)] }));
    const lost = t.accept(packet({ channel: 0, firstSequence: 5, samples: [wire(100)] }));
    const fine = t.accept(packet({ channel: 1, streamId: 0x1235, firstSequence: 1, samples: [wire(21)] }));
    expect(lost.samples[0]!.quality_flags).toEqual(['sample_gap']);
    expect(fine.samples[0]!.quality_flags).toEqual([]);
    expect(fine.samples[0]!.source_id).toBe('imu-0000a1b2c3d4e5f6-ch1');
  });

  it('round-trips an encoded packet through decode and tracking', () => {
    const t = tracker();
    const bytes = encodeSamplePacket({ streamStart: true, deviceOverflow: false, accelRange: 2, gyroRange: 1, channel: 2, streamId: 7, firstSequence: 0, samples: [wire(5, 4096)] });
    const decoded = decodePacket(bytes);
    if (!decoded.ok || decoded.packet.type !== 'samples') throw new Error('decode failed');
    const [s] = t.accept(decoded.packet).samples;
    expect(s!.accel_m_s2[2]).toBeCloseTo(9.80665, 12);
  });
});
