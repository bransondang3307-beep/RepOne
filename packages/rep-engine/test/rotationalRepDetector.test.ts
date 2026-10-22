import {
  LABELLED_SET_SCRIPT,
  createSyntheticCalibration,
  generateTrace,
  type RawSensorSample,
  type RepCalibration,
  type RepEvent,
} from '@repone/sensor-contracts';
import { ROTATIONAL_REP_ALGORITHM_VERSION, RotationalRepDetector, calibrateFromReferenceRep, evaluateReps } from '../src';
import { BASE_SIMULATION, labelledSetTrace } from './fixtures';

const calibration = createSyntheticCalibration(0);

function run(samples: readonly RawSensorSample[], cal: RepCalibration = calibration): RepEvent[] {
  const detector = new RotationalRepDetector('session-1', cal);
  return samples.flatMap((s) => detector.push(s));
}

describe('RotationalRepDetector', () => {
  it('detects every labelled rep and classifies full vs partial on the low-noise set', () => {
    const trace = labelledSetTrace();
    const result = evaluateReps(run(trace.samples), trace.labels);
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(0);
    expect(result.classificationAgreement).toBe(1);
  });

  it('emits events that follow the derived-event contract with provenance and no fabricated confidence', () => {
    const [event] = run(labelledSetTrace().samples);
    expect(event).toMatchObject({
      session_id: 'session-1',
      activity_type: 'gym',
      event_type: 'rep_completed',
      value: 1,
      confidence: null,
      calibration_id: calibration.calibration_id,
      algorithm_version: ROTATIONAL_REP_ALGORITHM_VERSION,
      provenance: 'imu_algorithm',
    });
    expect(event!.start_timestamp_ms).toBeLessThan(event!.timestamp_ms);
    expect(event!.peak_excursion_rad).toBeGreaterThan(0);
  });

  it('is deterministic: the same recording replays to identical events', () => {
    const trace = labelledSetTrace();
    expect(run(trace.samples)).toEqual(run(trace.samples));
  });

  it('emits nothing for a sensor at rest, even with noise and bias drift over 60 s', () => {
    const trace = generateTrace(
      { segments: [{ kind: 'rest', durationMs: 60_000 }] },
      { ...BASE_SIMULATION, gyroNoiseRadS: 0.03, gyroBiasRadS: [0.01, 0, 0] },
    );
    expect(run(trace.samples)).toEqual([]);
  });

  it('remains accurate with gyro noise up to 0.06 rad/s (seed sweep, synthetic)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const trace = generateTrace(LABELLED_SET_SCRIPT, { ...BASE_SIMULATION, seed, gyroNoiseRadS: 0.06 });
      const result = evaluateReps(run(trace.samples), trace.labels);
      expect({ seed, fp: result.falsePositives, fn: result.falseNegatives }).toEqual({ seed, fp: 0, fn: 0 });
    }
  });

  it('documents a known limitation: at 0.12 rad/s noise, stillness is rarely detected and reps are missed', () => {
    let missed = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const trace = generateTrace(LABELLED_SET_SCRIPT, { ...BASE_SIMULATION, seed, gyroNoiseRadS: 0.12 });
      missed += evaluateReps(run(trace.samples), trace.labels).falseNegatives;
    }
    expect(missed).toBeGreaterThan(0);
  });

  it('works on a non-default axis when calibrated from a reference rep with gyro bias', () => {
    const sim = { ...BASE_SIMULATION, axis: 1 as const, gyroBiasRadS: [0.02, 0.04, -0.01] as const };
    const reference = generateTrace(
      {
        segments: [
          { kind: 'rest', durationMs: 2000 },
          { kind: 'rep', durationMs: 2000, amplitudeRad: calibration.full_rom_rad, label: 'full' },
        ],
      },
      sim,
    );
    const cal = calibrateFromReferenceRep({
      calibrationId: 'cal-axis-y',
      restSamples: reference.samples.filter((s) => s.timestamp_ms < 2000),
      referenceRepSamples: reference.samples.filter((s) => s.timestamp_ms >= 2000),
      provenance: 'synthetic',
      createdAtEpochMs: 0,
    });
    const trace = generateTrace(LABELLED_SET_SCRIPT, { ...sim, seed: 99 });
    const result = evaluateReps(run(trace.samples, cal), trace.labels);
    expect(result.falsePositives + result.falseNegatives).toBe(0);
    expect(result.classificationAgreement).toBe(1);
  });

  it('abandons a rep in progress across a sample gap instead of integrating through it', () => {
    const trace = labelledSetTrace();
    const firstLabel = trace.labels[0]!;
    const mid = (firstLabel.startMs + firstLabel.endMs) / 2;
    // Remove 500 ms of samples in the middle of the first rep.
    const gapped = trace.samples.filter((s) => s.timestamp_ms < mid - 250 || s.timestamp_ms > mid + 250);
    const result = evaluateReps(run(gapped), trace.labels);
    expect(result.missedLabels).toEqual([firstLabel]);
    expect(result.falsePositives).toBe(0);
  });

  it('documents a known limitation: with uncorrected gyro bias and no rest periods, drift causes errors', () => {
    // Back-to-back reps with no rest window → no re-zeroing; a large uncalibrated bias accumulates.
    const segments = Array.from({ length: 10 }, () => ({
      kind: 'rep' as const,
      durationMs: 2000,
      amplitudeRad: calibration.full_rom_rad,
      label: 'full' as const,
    }));
    const trace = generateTrace({ segments }, { ...BASE_SIMULATION, gyroBiasRadS: [0.15, 0, 0] });
    const result = evaluateReps(run(trace.samples), trace.labels);
    expect(result.falseNegatives + result.falsePositives + result.misclassified.length).toBeGreaterThan(0);
  });

  it('rejects an invalid calibration', () => {
    expect(() => new RotationalRepDetector('s', { ...calibration, full_rom_rad: 0 })).toThrow();
  });
});
