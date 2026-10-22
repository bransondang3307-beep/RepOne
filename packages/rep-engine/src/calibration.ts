import type { AxisIndex, RawSensorSample, RepCalibration, Vec3 } from '@repone/sensor-contracts';


/** Mean gyro reading over samples taken while the sensor is held still. */
export function estimateGyroBias(restSamples: readonly RawSensorSample[]): Vec3 {
  if (restSamples.length === 0) throw new Error('estimateGyroBias needs at least one sample');
  const sum = [0, 0, 0];
  for (const s of restSamples) for (let i = 0; i < 3; i++) sum[i]! += s.gyro_rad_s[i]!;
  const n = restSamples.length;
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

/** Axis with the largest angular-velocity energy — the likely rotation axis. */
export function dominantAxis(samples: readonly RawSensorSample[], bias: Vec3 = [0, 0, 0]): AxisIndex {
  const energy = [0, 0, 0];
  for (const s of samples) for (let i = 0; i < 3; i++) energy[i]! += (s.gyro_rad_s[i]! - bias[i]!) ** 2;
  const max = Math.max(...energy);
  return energy.indexOf(max) as AxisIndex;
}

/**
 * Peak |angle| reached while integrating the bias-corrected gyro over a single
 * reference rep (trapezoidal rule). Short windows only — integration drifts.
 */
export function measurePeakExcursionRad(samples: readonly RawSensorSample[], axis: AxisIndex, bias: Vec3): number {
  let angle = 0;
  let peak = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const cur = samples[i]!;
    const dt = (cur.timestamp_ms - prev.timestamp_ms) / 1000;
    const w0 = prev.gyro_rad_s[axis] - bias[axis];
    const w1 = cur.gyro_rad_s[axis] - bias[axis];
    angle += ((w0 + w1) / 2) * dt;
    peak = Math.max(peak, Math.abs(angle));
  }
  return peak;
}

export interface CalibrateFromReferenceInput {
  readonly calibrationId: string;
  readonly restSamples: readonly RawSensorSample[];
  readonly referenceRepSamples: readonly RawSensorSample[];
  readonly provenance: RepCalibration['provenance'];
  readonly createdAtEpochMs: number;
}

/** Build a calibration from a still period followed by one user-performed full rep. */
export function calibrateFromReferenceRep(input: CalibrateFromReferenceInput): RepCalibration {
  const bias = estimateGyroBias(input.restSamples);
  const axis = dominantAxis(input.referenceRepSamples, bias);
  const rom = measurePeakExcursionRad(input.referenceRepSamples, axis, bias);
  if (rom <= 0) throw new Error('Reference rep produced no measurable rotation');
  return {
    calibration_id: input.calibrationId,
    axis,
    gyro_bias_rad_s: bias,
    full_rom_rad: rom,
    provenance: input.provenance,
    created_at_epoch_ms: input.createdAtEpochMs,
  };
}
