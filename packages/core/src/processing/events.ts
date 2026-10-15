import type { RawSensorSample } from '../sensors/types';

/**
 * Derived event — mirrors the "Derived event" contract in
 * REPONE_SOURCE_OF_TRUTH.md §7, plus a few additive fields (marked below)
 * recorded in docs/decisions/0002-sensor-contract-and-rep-detector.md.
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
