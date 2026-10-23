import {
  DEMO_FULL_ROM_RAD,
  LABELLED_SET_SCRIPT,
  createSyntheticCalibration,
  generateTrace,
  type MotionDetector,
  type MotionScript,
  type RawSensorSample,
  type RepCalibration,
  type RepEvent,
} from '@repone/sensor-contracts';
import { MultiChannelRepDetector, ROTATIONAL_REP_ALGORITHM_VERSION, RotationalRepDetector, type ChannelRepEvent } from '../src';
import { BASE_SIMULATION } from './fixtures';

// Two synthetic IMUs (not real recordings): A rotates about x on the labelled set, B about y on its own script,
// with an independent clock that starts 250 s later. Both 50 Hz.
const SCRIPT_B: MotionScript = {
  segments: [
    { kind: 'rest', durationMs: 1500 },
    { kind: 'rep', durationMs: 1800, amplitudeRad: DEMO_FULL_ROM_RAD, label: 'full' },
    { kind: 'rest', durationMs: 900 },
    { kind: 'rep', durationMs: 1600, amplitudeRad: DEMO_FULL_ROM_RAD * 0.5, label: 'partial' },
    { kind: 'rest', durationMs: 900 },
    { kind: 'rep', durationMs: 2200, amplitudeRad: DEMO_FULL_ROM_RAD, label: 'full' },
    { kind: 'rest', durationMs: 1200 },
  ],
};
const CAL_A: RepCalibration = { ...createSyntheticCalibration(0), calibration_id: 'cal-a' };
const CAL_B: RepCalibration = { ...createSyntheticCalibration(0), calibration_id: 'cal-b', axis: 1 };
const CALIBRATIONS = new Map([
  ['imu-a', CAL_A],
  ['imu-b', CAL_B],
]);

const channelA = (gyroNoiseRadS = 0.02) =>
  generateTrace(LABELLED_SET_SCRIPT, { ...BASE_SIMULATION, sourceId: 'imu-a', seed: 42, gyroNoiseRadS }).samples;
const channelB = () =>
  generateTrace(SCRIPT_B, { ...BASE_SIMULATION, sourceId: 'imu-b', seed: 7, axis: 1 }).samples.map((s) => ({
    ...s,
    timestamp_ms: s.timestamp_ms + 250_000,
  }));

/** Round-robin arrival: both IMUs stream at once, each in its own clock. */
function interleave(...channels: (readonly RawSensorSample[])[]): RawSensorSample[] {
  const out: RawSensorSample[] = [];
  for (let i = 0; i < Math.max(...channels.map((c) => c.length)); i++) {
    for (const channel of channels) if (i < channel.length) out.push(channel[i]!);
  }
  return out;
}

const bare = (samples: readonly RawSensorSample[], calibration: RepCalibration) => {
  const detector = new RotationalRepDetector('session-1', calibration);
  return samples.flatMap((s) => detector.push(s));
};

function runChannels(samples: readonly RawSensorSample[], detector = new MultiChannelRepDetector('session-1', { calibrations: CALIBRATIONS })) {
  const events = samples.flatMap((s) => detector.push(s));
  const of = (sourceId: string): RepEvent[] => events.filter((e) => e.source_id === sourceId).map((e) => e.event);
  return { events, of, detector };
}

const counts = (events: readonly RepEvent[]) => ({
  full: events.filter((e) => e.classification === 'full').length,
  partial: events.filter((e) => e.classification === 'partial').length,
});

describe('MultiChannelRepDetector', () => {
  it('gives exactly the bare detector\'s events for a single channel', () => {
    const samples = channelA();
    const detector = new MultiChannelRepDetector('session-1', { calibrations: new Map([['imu-a', CAL_A]]) });
    const events = samples.flatMap((s) => detector.push(s));
    const expected = bare(samples, CAL_A);
    expect(counts(expected)).toEqual({ full: 8, partial: 2 });
    expect(events).toEqual(expected.map((event): ChannelRepEvent => ({ source_id: 'imu-a', event })));
    expect(detector.algorithmVersion).toBe(ROTATIONAL_REP_ALGORITHM_VERSION);
  });

  it('detects each of two interleaved channels as if it were alone, with its own calibration', () => {
    const a = channelA();
    const b = channelB();
    const { of } = runChannels(interleave(a, b));
    expect(of('imu-a')).toEqual(bare(a, CAL_A));
    expect(of('imu-b')).toEqual(bare(b, CAL_B));
    expect(counts(of('imu-b'))).toEqual({ full: 2, partial: 1 });
    expect(of('imu-a').every((e) => e.calibration_id === 'cal-a')).toBe(true);
    expect(of('imu-b').every((e) => e.calibration_id === 'cal-b')).toBe(true);
  });

  it('is needed: one bare detector fed both channels loses channel A\'s reps', () => {
    const a = channelA();
    const mixed = bare(interleave(a, channelB()), CAL_A);
    expect(mixed).not.toEqual(bare(a, CAL_A));
  });

  it('keeps a sample gap on one channel from affecting the other', () => {
    const a = channelA().filter((s) => s.timestamp_ms < 6000 || s.timestamp_ms >= 7000);
    const b = channelB();
    const { of } = runChannels(interleave(a, b));
    expect(of('imu-a')).toEqual(bare(a, CAL_A));
    expect(of('imu-b')).toEqual(bare(b, CAL_B));
  });

  it('keeps a channel that stops early (e.g. connection lost) from affecting the other', () => {
    const a = channelA().filter((s) => s.timestamp_ms < 5000);
    const b = channelB();
    const { of } = runChannels(interleave(a, b));
    expect(of('imu-a')).toEqual(bare(a, CAL_A));
    expect(of('imu-b')).toEqual(bare(b, CAL_B));
  });

  it('keeps heavy noise on one channel from affecting the other', () => {
    const a = channelA(0.12);
    const b = channelB();
    const { of } = runChannels(interleave(a, b));
    expect(of('imu-a')).toEqual(bare(a, CAL_A));
    expect(of('imu-b')).toEqual(bare(b, CAL_B));
  });

  it('resets one channel without touching the other, even mid-rep', () => {
    const a = channelA();
    const b = channelB();
    const mixed = interleave(a, b);
    // Reset A while B is in the middle of its first rep, so resetting B by mistake would lose that rep.
    const resetAtMs = 250_000 + 2400;
    expect(bare(b, CAL_B).some((e) => e.start_timestamp_ms < resetAtMs && e.timestamp_ms > resetAtMs)).toBe(true);
    const split = mixed.findIndex((s) => s.source_id === 'imu-b' && s.timestamp_ms >= resetAtMs);
    const detector = new MultiChannelRepDetector('session-1', { calibrations: CALIBRATIONS });
    const before = mixed.slice(0, split).flatMap((s) => detector.push(s));
    detector.resetChannel('imu-a');
    const after = mixed.slice(split).flatMap((s) => detector.push(s));
    const events = [...before, ...after];
    expect(events.filter((e) => e.source_id === 'imu-b').map((e) => e.event)).toEqual(bare(b, CAL_B));
    expect(events.filter((e) => e.source_id === 'imu-a').map((e) => e.event)).not.toEqual(bare(a, CAL_A));
  });

  it('ignores and counts samples from channels without a calibration', () => {
    const stray = channelB().map((s) => ({ ...s, source_id: 'imu-unknown' }));
    const a = channelA();
    const { of, events, detector } = runChannels(interleave(a, stray));
    expect(of('imu-a')).toEqual(bare(a, CAL_A));
    expect(events.some((e) => e.source_id === 'imu-unknown')).toBe(false);
    expect(detector.ignoredSampleCounts()).toEqual(new Map([['imu-unknown', stray.length]]));
    expect(detector.channels).toEqual(['imu-a', 'imu-b']);
  });

  it('rejects an empty channel list, an invalid calibration and mixed algorithm versions', () => {
    expect(() => new MultiChannelRepDetector('s', { calibrations: new Map() })).toThrow(/At least one channel/);
    expect(
      () => new MultiChannelRepDetector('s', { calibrations: new Map([['imu-a', { ...CAL_A, full_rom_rad: 0 }]]) }),
    ).toThrow(/full_rom_rad must be positive/);
    let n = 0;
    const createDetector = (): MotionDetector<RepEvent> => ({ algorithmVersion: `v${++n}`, push: () => [], reset: () => {} });
    expect(() => new MultiChannelRepDetector('s', { calibrations: CALIBRATIONS, createDetector })).toThrow(
      /one algorithm version/,
    );
  });
});
