import {
  DEMO_FULL_ROM_RAD,
  LABELLED_SET_SCRIPT,
  SimulatedDevice,
  createSyntheticCalibration,
  generateTrace,
  type MotionScript,
  type RawSensorSample,
  type RepCalibration,
  type SimulatedChannelSpec,
} from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { MultiChannelRepDetector, RotationalRepDetector, type ChannelRepEvent } from '../src';
import { BASE_SIMULATION } from './fixtures';

// A simulated two-IMU device streaming live into the per-channel engine. Synthetic data only.
const SCRIPT_B: MotionScript = {
  segments: [
    { kind: 'rest', durationMs: 1500 },
    { kind: 'rep', durationMs: 1800, amplitudeRad: DEMO_FULL_ROM_RAD, label: 'full' },
    { kind: 'rest', durationMs: 900 },
    { kind: 'rep', durationMs: 2200, amplitudeRad: DEMO_FULL_ROM_RAD, label: 'full' },
    { kind: 'rest', durationMs: 1200 },
  ],
};
const A: SimulatedChannelSpec = { script: LABELLED_SET_SCRIPT, simulation: { ...BASE_SIMULATION, sourceId: 'imu-a' } };
const B: SimulatedChannelSpec = { script: SCRIPT_B, simulation: { ...BASE_SIMULATION, sourceId: 'imu-b', seed: 7, axis: 1 } };
const CAL_A: RepCalibration = { ...createSyntheticCalibration(0), calibration_id: 'cal-a' };
const CAL_B: RepCalibration = { ...createSyntheticCalibration(0), calibration_id: 'cal-b', axis: 1 };

const alone = (spec: SimulatedChannelSpec, calibration: RepCalibration, limit = Number.POSITIVE_INFINITY) => {
  const detector = new RotationalRepDetector('session-1', calibration);
  return generateTrace(spec.script, spec.simulation).samples.slice(0, limit).flatMap((s) => detector.push(s));
};

async function recordDevice(channels: readonly SimulatedChannelSpec[]) {
  const scheduler = new ManualScheduler();
  const device = new SimulatedDevice({ deviceId: 'sim-device-01', channels, scheduler });
  await device.connect();
  const engine = new MultiChannelRepDetector('session-1', {
    calibrations: new Map([
      ['imu-a', CAL_A],
      ['imu-b', CAL_B],
    ]),
  });
  const events: ChannelRepEvent[] = [];
  const onSample = (s: RawSensorSample) => events.push(...engine.push(s));
  for (const { source } of device.getChannels()) {
    source.subscribe(onSample);
    await source.start();
  }
  scheduler.advance(60_000);
  return { device, of: (id: string) => events.filter((e) => e.source_id === id).map((e) => e.event) };
}

describe('Simulated two-IMU device → MultiChannelRepDetector', () => {
  it('detects each channel streamed live exactly as it is detected alone', async () => {
    const { of } = await recordDevice([A, B]);
    expect(of('imu-a')).toEqual(alone(A, CAL_A));
    expect(of('imu-b')).toEqual(alone(B, CAL_B));
    expect(of('imu-a').filter((e) => e.classification === 'full')).toHaveLength(8);
    expect(of('imu-b')).toHaveLength(2);
  });

  it('keeps detecting channel B when channel A fails mid-set', async () => {
    const failingA: SimulatedChannelSpec = { ...A, fault: { afterSamples: 250, code: 'connection_lost' } };
    const { device, of } = await recordDevice([failingA, B]);
    expect(device.getChannels()[0]!.source.getLastError()?.code).toBe('connection_lost');
    expect(of('imu-a')).toEqual(alone(A, CAL_A, 250));
    expect(of('imu-b')).toEqual(alone(B, CAL_B));
  });
});
