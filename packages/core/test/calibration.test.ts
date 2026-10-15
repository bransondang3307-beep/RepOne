import {
  DEMO_FULL_ROM_RAD,
  calibrateFromReferenceRep,
  estimateGyroBias,
  generateTrace,
  type MotionScript,
} from '../src';
import { BASE_SIMULATION } from './helpers/fixtures';

const referenceScript: MotionScript = {
  segments: [
    { kind: 'rest', durationMs: 2000 },
    { kind: 'rep', durationMs: 2000, amplitudeRad: DEMO_FULL_ROM_RAD, label: 'full' },
  ],
};

describe('calibration', () => {
  it('estimates gyro bias from a still period', () => {
    const trace = generateTrace(referenceScript, { ...BASE_SIMULATION, gyroBiasRadS: [0.03, -0.02, 0.01] });
    const rest = trace.samples.filter((s) => s.timestamp_ms < 2000);
    const bias = estimateGyroBias(rest);
    expect(bias[0]).toBeCloseTo(0.03, 2);
    expect(bias[1]).toBeCloseTo(-0.02, 2);
    expect(bias[2]).toBeCloseTo(0.01, 2);
  });

  it.each([0, 1] as const)('recovers rotation axis %i and full ROM within 3%% from one reference rep', (axis) => {
    const trace = generateTrace(referenceScript, { ...BASE_SIMULATION, axis, gyroBiasRadS: [0.03, -0.02, 0.01] });
    const calibration = calibrateFromReferenceRep({
      calibrationId: 'cal-1',
      restSamples: trace.samples.filter((s) => s.timestamp_ms < 2000),
      referenceRepSamples: trace.samples.filter((s) => s.timestamp_ms >= 2000),
      provenance: 'synthetic',
      createdAtEpochMs: 0,
    });
    expect(calibration.axis).toBe(axis);
    expect(Math.abs(calibration.full_rom_rad - DEMO_FULL_ROM_RAD) / DEMO_FULL_ROM_RAD).toBeLessThan(0.03);
  });

  it('rejects an empty rest window', () => {
    expect(() => estimateGyroBias([])).toThrow();
  });
});
