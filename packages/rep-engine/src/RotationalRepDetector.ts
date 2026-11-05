import type { MotionDetector, RawSensorSample, RepCalibration, RepEvent, Vec3 } from '@repone/sensor-contracts';

export const ROTATIONAL_REP_ALGORITHM_VERSION = 'rotational-rep-fsm-0.2.0';

/** Standard gravity, m/s² (the magnitude a resting accelerometer reads). */
const STANDARD_GRAVITY_M_S2 = 9.80665;

/**
 * Thresholds are fractions of the calibrated full range of motion (ROM). Defaults are
 * unvalidated starting hypotheses (ADR 0002, ADR 0009), not tuned values.
 */
export interface RotationalRepDetectorConfig {
  /** Excursion that marks the start of a movement cycle. */
  readonly startFraction: number;
  /** Excursion at/below which the movement is considered returned to start. */
  readonly returnFraction: number;
  /** Peak excursion at/above which a rep is classified `full`; otherwise `partial`. */
  readonly fullFraction: number;
  /**
   * Settled = over the last `restWindowMs`, the integrated angle stayed within a band this wide (fraction of ROM).
   * A position criterion: constant-speed motion is never settled, while zero-mean jitter smaller than the band is.
   */
  readonly restBandFraction: number;
  /** Window over which the settled criterion is evaluated, ms. */
  readonly restWindowMs: number;
  /** Gap between samples above this loses the position reference: the cycle in progress is `interrupted`. */
  readonly maxSampleGapMs: number;
  /**
   * A cycle lasting longer than this is still tracked and completes normally, but its event carries the
   * `long_cycle` flag. It is never abandoned and never promoted (ADR 0009 §2.6).
   */
  readonly longCycleMs: number;
  /**
   * Minimum share of gravity (9.80665 m/s²) that must lie in the rotation plane for the accelerometer to give an
   * absolute angle at rest. Below it (rotation axis near vertical) gravity is unobservable and only the gyro is used.
   * A value above 1 disables the gravity reference.
   */
  readonly minGravityPlaneFraction: number;
}

export const DEFAULT_ROTATIONAL_REP_CONFIG: RotationalRepDetectorConfig = {
  startFraction: 0.2,
  returnFraction: 0.1,
  fullFraction: 0.8,
  restBandFraction: 0.02,
  restWindowMs: 300,
  maxSampleGapMs: 200,
  longCycleMs: 10_000,
  minGravityPlaneFraction: 0.5,
};

/**
 * A movement cycle that ended without a rep (ADR 0009 §2.7). Never counted, never classified full/partial.
 * - `interrupted`: the position reference was lost mid-cycle (sample gap above `maxSampleGapMs`).
 * - `incomplete`: the session ended (`finish()`) before the cycle returned to start.
 */
export interface UnfinishedCycle {
  readonly outcome: 'interrupted' | 'incomplete';
  readonly reason: 'sample_gap' | 'session_end';
  /** Sensor timestamp at which the cycle began, ms. */
  readonly start_timestamp_ms: number;
  /** Last sensor timestamp at which the cycle was observed, ms. */
  readonly last_timestamp_ms: number;
  /** Peak integrated angular excursion observed, radians. Algorithm-derived, not a direct measurement. */
  readonly peak_excursion_rad: number;
  readonly quality_flags: readonly string[];
}

/** Quality flags this detector adds to events (ADR 0009 §2.8). Sample flags are passed through as well. */
export const DETECTOR_QUALITY_FLAGS = {
  /** The cycle lasted longer than `longCycleMs`. */
  longCycle: 'long_cycle',
  /** At a mid-cycle rest, the gravity angle disagreed with the gyro angle by more than `startFraction`; not applied. */
  gravityDisagreement: 'gravity_disagreement',
  /** After a gap, the reference was re-established without gravity: the rest position was assumed to be the start. */
  referenceAssumed: 'reference_assumed',
} as const;

type State =
  /** Position reference unknown (session start or after a gap): wait until settled. */
  | { kind: 'syncing' }
  /** At the start position (excursion below `startFraction`). */
  | { kind: 'idle' }
  /** A cycle observed from its start is in progress. Pauses and same-direction resumption stay in this state. */
  | { kind: 'moving'; startMs: number; peakRad: number; peakSign: number; flags: Set<string> }
  /** Away from start after a gap; the cycle's start was not observed. Returning to start counts nothing. */
  | { kind: 'returning'; settledSinceMs: number | null };

interface WindowEntry {
  readonly t: number;
  readonly rawAngle: number;
  readonly accel: Vec3;
}

/**
 * Interpretable finite-state rep detector for rotating mechanisms (ADR 0002, revised by ADR 0009).
 *
 * Position, not acceleration, drives every transition. The bias-corrected angular velocity about the calibrated
 * axis is integrated to an angle relative to the start position. A cycle starts when the excursion exceeds
 * `startFraction`, and completes — emitting exactly one rep — only when the excursion returns to `returnFraction`.
 * Pausing, slowing down or re-accelerating inside a cycle therefore never ends it or starts another.
 *
 * At rest the accelerometer measures gravity, which gives the absolute angle from the start position whenever the
 * rotation axis is not vertical. The detector uses it to correct gyro drift during mid-cycle pauses and to
 * re-establish the position after a sample gap, instead of assuming that the next rest is the start.
 */
export class RotationalRepDetector implements MotionDetector<RepEvent> {
  readonly algorithmVersion = ROTATIONAL_REP_ALGORITHM_VERSION;
  private readonly config: RotationalRepDetectorConfig;
  private state: State = { kind: 'syncing' };
  /** Integrated angle since the last gap, never re-zeroed; the angle from start is `rawAngle - zeroOffset`. */
  private rawAngle = 0;
  private zeroOffset = 0;
  private prev: { timestampMs: number; omega: number } | null = null;
  /** Samples of the last `restWindowMs` (plus one older entry), for the settled test and the rest gravity mean. */
  private window: WindowEntry[] = [];
  /** Gravity direction (rest accelerometer mean) at the start position; null when unobservable or unknown. */
  private gravityAtStart: Vec3 | null = null;
  /** Sign of the angle at the peak of the last observed cycle — which side of start the movement goes to. */
  private outwardSign = 1;
  /** Flags raised while no cycle was in progress; attached to the next cycle. */
  private pendingFlags = new Set<string>();
  private unfinished: UnfinishedCycle[] = [];
  /** True once a reference has been established in this session, so a later sync is a re-sync. */
  private hadReference = false;

  constructor(
    private readonly sessionId: string,
    private readonly calibration: RepCalibration,
    config: Partial<RotationalRepDetectorConfig> = {},
  ) {
    if (!(calibration.full_rom_rad > 0)) throw new Error('Calibration full_rom_rad must be positive');
    this.config = { ...DEFAULT_ROTATIONAL_REP_CONFIG, ...config };
  }

  reset(): void {
    this.state = { kind: 'syncing' };
    this.rawAngle = 0;
    this.zeroOffset = 0;
    this.prev = null;
    this.window = [];
    this.gravityAtStart = null;
    this.outwardSign = 1;
    this.pendingFlags = new Set();
    this.unfinished = [];
    this.hadReference = false;
  }

  /** Cycles that ended without a rep since the last call (ADR 0009 §2.7). */
  takeUnfinishedCycles(): UnfinishedCycle[] {
    const taken = this.unfinished;
    this.unfinished = [];
    return taken;
  }

  /**
   * End of session: a cycle still in progress is closed as `incomplete` — never as a rep. Returns every unfinished
   * cycle not yet taken, then resets the detector.
   */
  finish(): UnfinishedCycle[] {
    if (this.prev !== null) this.closeUnfinished('incomplete', 'session_end', this.prev.timestampMs);
    const taken = this.takeUnfinishedCycles();
    this.reset();
    return taken;
  }

  push(sample: RawSensorSample): RepEvent[] {
    const { axis, gyro_bias_rad_s: bias } = this.calibration;
    const omega = sample.gyro_rad_s[axis] - bias[axis];
    const t = sample.timestamp_ms;

    if (this.prev !== null) {
      const dtMs = t - this.prev.timestampMs;
      if (dtMs <= 0) return []; // duplicate / out-of-order sample: ignore
      if (dtMs > this.config.maxSampleGapMs) {
        this.loseReference(this.prev.timestampMs);
      } else {
        this.rawAngle += ((this.prev.omega + omega) / 2) * (dtMs / 1000);
      }
    }
    this.prev = { timestampMs: t, omega };
    const settled = this.trackWindow(t, sample.accel_m_s2);

    switch (this.state.kind) {
      case 'syncing':
        if (settled) this.sync();
        return [];
      case 'idle':
        return this.onIdle(t, settled, sample);
      case 'returning':
        this.onReturning(t, settled);
        return [];
      case 'moving':
        return this.onMoving(t, settled, sample);
    }
  }

  private get rom(): number {
    return this.calibration.full_rom_rad;
  }

  private get angle(): number {
    return this.rawAngle - this.zeroOffset;
  }

  /** Declare that the settled window's mean position is at `angleRad` from start. */
  private setWindowAngle(angleRad: number): void {
    let sum = 0;
    for (const { rawAngle } of this.window) sum += rawAngle;
    this.zeroOffset = (this.window.length > 0 ? sum / this.window.length : this.rawAngle) - angleRad;
  }

  private onIdle(t: number, settled: boolean, sample: RawSensorSample): RepEvent[] {
    const angle = this.angle;
    if (Math.abs(angle) >= this.config.startFraction * this.rom) {
      const flags = new Set([...this.pendingFlags, ...sample.quality_flags]);
      this.pendingFlags.clear();
      this.state = { kind: 'moving', startMs: t, peakRad: Math.abs(angle), peakSign: Math.sign(angle), flags };
      return [];
    }
    // Drift control: settled at the start position, so this is the start position.
    if (settled) this.zeroAtStart();
    return [];
  }

  private onReturning(t: number, settled: boolean): void {
    if (this.state.kind !== 'returning') return;
    if (settled) {
      this.state.settledSinceMs ??= t;
      this.correctFromGravity(null);
      // Parked away from start for a long time: accept the rest position as the new start, by assumption.
      if (t - this.state.settledSinceMs > this.config.longCycleMs) {
        this.zeroAtStart();
        this.pendingFlags.add(DETECTOR_QUALITY_FLAGS.referenceAssumed);
        this.state = { kind: 'idle' };
        return;
      }
    } else {
      this.state.settledSinceMs = null;
    }
    if (Math.abs(this.angle) <= this.config.returnFraction * this.rom) this.state = { kind: 'idle' };
  }

  private onMoving(t: number, settled: boolean, sample: RawSensorSample): RepEvent[] {
    if (this.state.kind !== 'moving') return [];
    const moving = this.state;
    // A pause mid-cycle: re-read the absolute angle from gravity (drift control). The cycle continues either way.
    if (settled) this.correctFromGravity(moving.flags);
    const angle = this.angle;
    const excursion = Math.abs(angle);
    if (excursion > moving.peakRad) {
      moving.peakRad = excursion;
      moving.peakSign = Math.sign(angle) || moving.peakSign;
    }
    for (const flag of sample.quality_flags) moving.flags.add(flag);
    if (t - moving.startMs > this.config.longCycleMs) moving.flags.add(DETECTOR_QUALITY_FLAGS.longCycle);

    if (excursion > this.config.returnFraction * this.rom) return [];

    this.state = { kind: 'idle' };
    if (moving.peakSign !== 0) this.outwardSign = moving.peakSign;
    return [
      {
        session_id: this.sessionId,
        activity_type: 'gym',
        event_type: 'rep_completed',
        timestamp_ms: t,
        value: 1,
        classification: moving.peakRad >= this.config.fullFraction * this.rom ? 'full' : 'partial',
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

  /** Sample gap: integration across it is meaningless, so the position reference is lost. */
  private loseReference(lastSeenMs: number): void {
    this.closeUnfinished('interrupted', 'sample_gap', lastSeenMs);
    this.state = { kind: 'syncing' };
    this.rawAngle = 0;
    this.zeroOffset = 0;
    this.window = [];
    // gravityAtStart and outwardSign survive the gap: they describe the machine, not the lost samples.
  }

  private closeUnfinished(outcome: UnfinishedCycle['outcome'], reason: UnfinishedCycle['reason'], lastMs: number): void {
    if (this.state.kind !== 'moving') return;
    this.unfinished.push({
      outcome,
      reason,
      start_timestamp_ms: this.state.startMs,
      last_timestamp_ms: lastMs,
      peak_excursion_rad: this.state.peakRad,
      quality_flags: [...this.state.flags],
    });
  }

  /** Settled while the reference is unknown: re-anchor from gravity if possible, else assume this is the start. */
  private sync(): void {
    const fromGravity = this.gravityExcursion();
    if (fromGravity === null) {
      if (this.hadReference) this.pendingFlags.add(DETECTOR_QUALITY_FLAGS.referenceAssumed);
      this.zeroAtStart();
      this.state = { kind: 'idle' };
    } else if (fromGravity < this.config.startFraction * this.rom) {
      this.zeroAtStart();
      this.state = { kind: 'idle' };
    } else {
      this.setWindowAngle(this.outwardSign * fromGravity);
      this.state = { kind: 'returning', settledSinceMs: null };
    }
    this.hadReference = true;
  }

  /** The settled window is the start position: its mean angle becomes zero and its gravity the reference. */
  private zeroAtStart(): void {
    this.setWindowAngle(0);
    const mean = this.restMean();
    this.gravityAtStart = mean !== null && this.planeMagnitude(mean) >= this.minPlaneMagnitude ? mean : null;
  }

  /**
   * At rest, replace the integrated angle by the gravity angle when both agree within `startFraction` of ROM.
   * A larger disagreement means non-gravity acceleration, a mounting change or gross drift: keep the gyro angle and
   * flag the cycle.
   */
  private correctFromGravity(flags: Set<string> | null): void {
    const fromGravity = this.gravityExcursion();
    if (fromGravity === null) return;
    const angle = this.angle;
    if (Math.abs(fromGravity - Math.abs(angle)) > this.config.startFraction * this.rom) {
      flags?.add(DETECTOR_QUALITY_FLAGS.gravityDisagreement);
      return;
    }
    this.setWindowAngle((Math.sign(angle) || this.outwardSign) * fromGravity);
  }

  /**
   * Unsigned angle between the start-position gravity direction and the current rest mean, about the calibrated
   * axis, radians. Sign-free, so it does not depend on the handedness of the sensor's axis convention.
   * Null when there is no gravity reference or gravity is not observable in the rotation plane.
   */
  private gravityExcursion(): number | null {
    const ref = this.gravityAtStart;
    const now = this.restMean();
    if (ref === null || now === null) return null;
    if (this.planeMagnitude(now) < this.minPlaneMagnitude) return null;
    const [i, j] = this.planeAxes;
    const cross = ref[i]! * now[j]! - ref[j]! * now[i]!;
    const dot = ref[i]! * now[i]! + ref[j]! * now[j]!;
    return Math.abs(Math.atan2(cross, dot));
  }

  private get planeAxes(): [number, number] {
    const a = this.calibration.axis;
    return [(a + 1) % 3, (a + 2) % 3];
  }

  private get minPlaneMagnitude(): number {
    return this.config.minGravityPlaneFraction * STANDARD_GRAVITY_M_S2;
  }

  private planeMagnitude(v: Vec3): number {
    const [i, j] = this.planeAxes;
    return Math.hypot(v[i]!, v[j]!);
  }

  /** Mean accelerometer reading over the settled window. */
  private restMean(): Vec3 | null {
    if (this.window.length === 0) return null;
    const sum = [0, 0, 0];
    for (const { accel } of this.window) for (let k = 0; k < 3; k++) sum[k]! += accel[k]!;
    const n = this.window.length;
    return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
  }

  /** Record the sample; true when the last `restWindowMs` are fully covered and the angle stayed within the band. */
  private trackWindow(t: number, accel: Vec3): boolean {
    this.window.push({ t, rawAngle: this.rawAngle, accel });
    const horizon = t - this.config.restWindowMs;
    while (this.window.length > 1 && this.window[1]!.t <= horizon) this.window.shift();
    if (this.window[0]!.t > horizon) return false;
    let min = Infinity;
    let max = -Infinity;
    for (const { rawAngle } of this.window) {
      min = Math.min(min, rawAngle);
      max = Math.max(max, rawAngle);
    }
    return max - min <= this.config.restBandFraction * this.rom;
  }
}
