import type { RawSensorSample } from '../sensors/types';
import type { RepCalibration } from './calibration';
import type { MotionDetector, RepEvent } from './events';

export const ROTATIONAL_REP_ALGORITHM_VERSION = 'rotational-rep-fsm-0.1.0';

/**
 * Thresholds are fractions of the calibrated full range of motion. Defaults are
 * unvalidated starting hypotheses (see ADR 0002), not tuned values.
 */
export interface RotationalRepDetectorConfig {
  /** Excursion that marks the start of a movement. */
  readonly startFraction: number;
  /** Excursion at/below which the movement is considered returned to start. */
  readonly returnFraction: number;
  /** Peak excursion at/above which a rep is classified `full`; otherwise `partial`. */
  readonly fullFraction: number;
  /** Smoothed |ω| below this (rad/s) counts as stationary. */
  readonly restOmegaRadS: number;
  /** Time constant of the low-pass filter applied to ω for stillness detection, ms. */
  readonly restSmoothingMs: number;
  /** Stationary this long (while not moving) → re-zero the integrated angle (drift control / sync). */
  readonly restWindowMs: number;
  /** Gap between samples above this aborts any rep in progress. */
  readonly maxSampleGapMs: number;
  /** A movement that has not returned within this time is abandoned. */
  readonly maxRepDurationMs: number;
}

export const DEFAULT_ROTATIONAL_REP_CONFIG: RotationalRepDetectorConfig = {
  startFraction: 0.2,
  returnFraction: 0.1,
  fullFraction: 0.8,
  restOmegaRadS: 0.05,
  restSmoothingMs: 50,
  restWindowMs: 300,
  maxSampleGapMs: 200,
  maxRepDurationMs: 10_000,
};

type State =
  /** Position reference unknown (start, after a gap or abandoned rep): wait for stillness. */
  | { kind: 'syncing'; restSinceMs: number | null }
  | { kind: 'idle'; restSinceMs: number | null }
  | { kind: 'moving'; startMs: number; peakRad: number; flags: Set<string> };

/**
 * Interpretable finite-state rep detector for rotating mechanisms:
 * integrate bias-corrected angular velocity about the calibrated axis, then
 * SYNCING → IDLE once the sensor has been still for `restWindowMs` (zeroing the
 * angle there), IDLE → MOVING when excursion exceeds the start threshold, and
 * MOVING → IDLE (emitting a rep) when it returns near the start position.
 * After a sample gap or an abandoned rep the reference position is unknown, so
 * the detector returns to SYNCING rather than guessing.
 */
export class RotationalRepDetector implements MotionDetector<RepEvent> {
  readonly algorithmVersion = ROTATIONAL_REP_ALGORITHM_VERSION;
  private readonly config: RotationalRepDetectorConfig;
  private state: State = { kind: 'syncing', restSinceMs: null };
  private angleRad = 0;
  private smoothedOmega = 0;
  private prev: { timestampMs: number; omega: number } | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly calibration: RepCalibration,
    config: Partial<RotationalRepDetectorConfig> = {},
  ) {
    if (!(calibration.full_rom_rad > 0)) throw new Error('Calibration full_rom_rad must be positive');
    this.config = { ...DEFAULT_ROTATIONAL_REP_CONFIG, ...config };
  }

  reset(): void {
    this.state = { kind: 'syncing', restSinceMs: null };
    this.angleRad = 0;
    this.smoothedOmega = 0;
    this.prev = null;
  }

  push(sample: RawSensorSample): RepEvent[] {
    const { axis, gyro_bias_rad_s: bias, full_rom_rad: rom } = this.calibration;
    const omega = sample.gyro_rad_s[axis] - bias[axis];
    const t = sample.timestamp_ms;

    if (this.prev === null) {
      this.prev = { timestampMs: t, omega };
      return [];
    }

    const dtMs = t - this.prev.timestampMs;
    if (dtMs <= 0) return []; // duplicate / out-of-order sample: ignore
    if (dtMs > this.config.maxSampleGapMs) {
      // Integration across a gap is meaningless; abandon any partial rep.
      this.reset();
      this.prev = { timestampMs: t, omega };
      return [];
    }

    this.angleRad += ((this.prev.omega + omega) / 2) * (dtMs / 1000);
    this.smoothedOmega += (dtMs / (this.config.restSmoothingMs + dtMs)) * (omega - this.smoothedOmega);
    this.prev = { timestampMs: t, omega };
    const excursion = Math.abs(this.angleRad);

    if (this.state.kind === 'syncing') {
      this.trackRest(t);
      return [];
    }

    if (this.state.kind === 'idle') {
      if (excursion >= this.config.startFraction * rom) {
        this.state = { kind: 'moving', startMs: t, peakRad: excursion, flags: new Set(sample.quality_flags) };
        return [];
      }
      this.trackRest(t);
      return [];
    }

    const moving = this.state;
    moving.peakRad = Math.max(moving.peakRad, excursion);
    for (const flag of sample.quality_flags) moving.flags.add(flag);

    if (t - moving.startMs > this.config.maxRepDurationMs) {
      this.reset();
      this.prev = { timestampMs: t, omega };
      return [];
    }

    if (excursion <= this.config.returnFraction * rom) {
      this.state = { kind: 'idle', restSinceMs: null };
      return [
        {
          session_id: this.sessionId,
          activity_type: 'gym',
          event_type: 'rep_completed',
          timestamp_ms: t,
          value: 1,
          classification: moving.peakRad >= this.config.fullFraction * rom ? 'full' : 'partial',
          confidence: null,
          calibration_id: this.calibration.calibration_id,
          algorithm_version: this.algorithmVersion,
          provenance: 'imu_algorithm',
          start_timestamp_ms: moving.startMs,
          peak_excursion_rad: moving.peakRad,
          quality_flags: [...moving.flags],
        },
      ];
    }
    return [];
  }

  /** While stationary for `restWindowMs`, re-zero the angle (drift control) and leave SYNCING. */
  private trackRest(t: number): void {
    if (this.state.kind === 'moving') return;
    if (Math.abs(this.smoothedOmega) >= this.config.restOmegaRadS) {
      this.state.restSinceMs = null;
      return;
    }
    this.state.restSinceMs ??= t;
    if (t - this.state.restSinceMs >= this.config.restWindowMs) {
      this.angleRad = 0;
      if (this.state.kind === 'syncing') this.state = { kind: 'idle', restSinceMs: this.state.restSinceMs };
    }
  }
}
