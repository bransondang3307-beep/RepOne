import type { AxisIndex, Vec3 } from './common';
import type { RawSensorSample } from './sensor';

/**
 * Per-machine calibration for the rotational rep detector. Stored with every
 * session so derived metrics can be traced back to the calibration used.
 */
export interface RepCalibration {
  readonly calibration_id: string;
  /** Sensor axis the mechanism rotates about. */
  readonly axis: AxisIndex;
  /** Gyro zero-rate offset to subtract, rad/s. */
  readonly gyro_bias_rad_s: Vec3;
  /** Angular excursion of one reference full rep, radians (magnitude). */
  readonly full_rom_rad: number;
  /** `synthetic` calibrations come from simulation and are not validated against real hardware. */
  readonly provenance: 'synthetic' | 'user_reference_rep';
  readonly created_at_epoch_ms: number;
}

/**
 * Derived event — mirrors the "Derived event" contract in
 * REPONE_SOURCE_OF_TRUTH.md §7, plus a few additive fields (marked below)
 * recorded in docs/decisions/0002-sensor-contract-and-rep-detector.md.
 *
 * Only `full` reps count toward a set; `partial` reps are logged with their
 * label for history/analysis (ADR 0003).
 */
export interface RepEvent {
  readonly session_id: string;
  readonly activity_type: 'gym';
  readonly event_type: 'rep_completed';
  /** Sensor timestamp at which the rep was completed, ms. */
  readonly timestamp_ms: number;
  readonly value: 1;
  readonly classification: 'full' | 'partial';
  /** Always null until a calibrated confidence model exists — never fabricated. */
  readonly confidence: null;
  readonly calibration_id: string;
  readonly algorithm_version: string;
  readonly provenance: 'imu_algorithm';
  /** Additive: sensor timestamp at which the rep began, ms. */
  readonly start_timestamp_ms: number;
  /** Additive: peak integrated angular excursion, radians. Algorithm-derived, not a direct measurement. */
  readonly peak_excursion_rad: number;
  /** Additive: quality flags raised while this rep was in progress (e.g. `sample_gap`). */
  readonly quality_flags: readonly string[];
}

/**
 * Pluggable activity detector. Gym rep detection is the first implementation;
 * a gait step detector would implement the same shape with its own event type.
 */
export interface MotionDetector<TEvent> {
  readonly algorithmVersion: string;
  /** Feed one sample; returns any events completed by it. */
  push(sample: RawSensorSample): TEvent[];
  reset(): void;
}
