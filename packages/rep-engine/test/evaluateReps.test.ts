import type { GroundTruthRep, RepEvent } from '@repone/sensor-contracts';
import { evaluateReps } from '../src';

const label = (startMs: number, endMs: number, classification: 'full' | 'partial' = 'full'): GroundTruthRep => ({
  startMs,
  endMs,
  classification,
  amplitudeRad: 1,
});

const event = (timestamp_ms: number, classification: 'full' | 'partial' = 'full'): RepEvent => ({
  session_id: 's',
  activity_type: 'gym',
  event_type: 'rep_completed',
  timestamp_ms,
  value: 1,
  classification,
  confidence: null,
  calibration_id: 'c',
  algorithm_version: 'test',
  provenance: 'imu_algorithm',
  start_timestamp_ms: timestamp_ms - 500,
  peak_excursion_rad: 1,
  quality_flags: [],
});

describe('evaluateReps', () => {
  it('counts true/false positives, misses and misclassifications one-to-one', () => {
    const labels = [label(0, 1000), label(2000, 3000), label(4000, 5000, 'partial')];
    const detections = [event(900), event(950), event(4800, 'full'), event(7000)];
    const result = evaluateReps(detections, labels, 100);
    expect(result.truePositives).toBe(2);
    expect(result.falsePositives).toBe(2);
    expect(result.falseNegatives).toBe(1);
    expect(result.precision).toBeCloseTo(0.5);
    expect(result.recall).toBeCloseTo(2 / 3);
    expect(result.classificationAgreement).toBeCloseTo(0.5);
    expect(result.missedLabels).toEqual([labels[1]]);
    expect(result.misclassified).toHaveLength(1);
  });

  it('reports undefined rates as null rather than inventing 0 or 1', () => {
    const result = evaluateReps([], []);
    expect(result.precision).toBeNull();
    expect(result.recall).toBeNull();
    expect(result.classificationAgreement).toBeNull();
  });
});
