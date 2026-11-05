/**
 * SYNTHETIC trajectory generator for rep-detector regression scenarios (RO-032, ADR 0009).
 *
 * Every trace produced here is synthetic: it is computed from a scripted angle trajectory, not recorded from a
 * sensor, and every sample carries the `synthetic` quality flag. Units follow the raw-sample contract
 * (`accel_m_s2` in m/s², `gyro_rad_s` in rad/s, `timestamp_ms` integer device milliseconds).
 *
 * Model: a rigid lever rotating about one sensor axis (the controlled rotational rig of source of truth §4).
 * - Angle θ(t) is scripted as a fraction of the calibrated full range of motion.
 * - Gyro on the rotation axis is the exact dθ/dt; the other axes read zero. Both get optional bias and white noise.
 * - Accelerometer reads gravity rotated by θ (same convention as the shared simulator), plus noise. Tangential and
 *   centripetal acceleration are ignored: they are < 2 % of g for the slow reps scripted here and zero at rest, which
 *   is the only time the detector reads the accelerometer.
 * - `mountFlipped` rotates the whole sensor 180° (a proper rotation), so gyro and accelerometer stay physically
 *   consistent while the gyro sign on the rotation axis inverts.
 *
 * Ground truth comes from the script, never from a detector: each `cycle(...)` produces one labelled cycle, and the
 * true time at which the position re-enters a given fraction of the start position is computed from θ(t) at 1 ms.
 */
import { GRAVITY_M_S2, createRandom, type AxisIndex, type RawSensorSample, type Vec3 } from '@repone/sensor-contracts';

export type MoveProfile = 'smooth' | 'constant';

export type Step =
  /** Move to `to` (fraction of full ROM, 0 = start position) over `durationMs`. */
  | { readonly kind: 'move'; readonly to: number; readonly durationMs: number; readonly profile: MoveProfile }
  /** Stay put, optionally with a sinusoidal tremor of `tremorFraction` (fraction of ROM, amplitude) at `tremorHz`. */
  | { readonly kind: 'hold'; readonly durationMs: number; readonly tremorFraction: number; readonly tremorHz: number };

export type ScriptItem = Step | { readonly kind: 'cycle'; readonly label: 'full' | 'partial'; readonly steps: readonly Step[] };

export const move = (to: number, durationMs: number, profile: MoveProfile = 'smooth'): Step => ({
  kind: 'move',
  to,
  durationMs,
  profile,
});
export const hold = (durationMs: number, tremorFraction = 0, tremorHz = 6): Step => ({
  kind: 'hold',
  durationMs,
  tremorFraction,
  tremorHz,
});
export const cycle = (label: 'full' | 'partial', ...steps: Step[]): ScriptItem => ({ kind: 'cycle', label, steps });

export interface TrajectoryOptions {
  readonly romRad: number;
  readonly sampleRateHz?: number;
  readonly seed?: number;
  readonly axis?: AxisIndex;
  /** Sensor mounted rotated 180°: the gyro sign on the rotation axis inverts (orientation variation). */
  readonly mountFlipped?: boolean;
  readonly gyroNoiseRadS?: number;
  readonly gyroBiasRadS?: Vec3;
  readonly accelNoiseMS2?: number;
  /** Uniform timestamp jitter, ± this fraction of the nominal period (irregular sampling). */
  readonly timestampJitter?: number;
  /** Intervals [startMs, endMs) in which no samples arrive (dropout / disconnect). Motion continues meanwhile. */
  readonly dropouts?: ReadonlyArray<readonly [number, number]>;
  /** Stop emitting samples at this time (session ends mid-movement). */
  readonly truncateAtMs?: number;
  readonly sourceId?: string;
}

/** A labelled cycle. Times are sensor milliseconds; `peakFraction` is the true peak excursion / ROM. */
export interface CycleLabel {
  readonly startMs: number;
  readonly endMs: number;
  readonly classification: 'full' | 'partial';
  readonly peakFraction: number;
  /** True time the position first reaches `fraction` of ROM away from start (NaN if never). */
  readonly trueOutwardMs: (fraction: number) => number;
  /** True time, after the peak, the position re-enters `fraction` of ROM from start (NaN if never). */
  readonly trueReturnMs: (fraction: number) => number;
}

/** A labelled stationary interval: `hold` between cycles, `pause` inside one. Tremor still counts as stationary. */
export interface StillLabel {
  readonly startMs: number;
  readonly endMs: number;
  readonly kind: 'hold' | 'pause';
}

export interface SyntheticScenarioTrace {
  readonly samples: readonly RawSensorSample[];
  readonly cycles: readonly CycleLabel[];
  readonly stills: readonly StillLabel[];
  readonly durationMs: number;
  readonly synthetic: true;
}

interface Segment {
  readonly startMs: number;
  readonly endMs: number;
  readonly from: number;
  readonly step: Step;
}

function flatten(script: readonly ScriptItem[]) {
  const segments: Segment[] = [];
  const cycleSpans: Array<{ startMs: number; endMs: number; label: 'full' | 'partial' }> = [];
  const stills: StillLabel[] = [];
  let t = 0;
  let position = 0;
  const push = (step: Step, inCycle: boolean) => {
    segments.push({ startMs: t, endMs: t + step.durationMs, from: position, step });
    if (step.kind === 'hold') stills.push({ startMs: t, endMs: t + step.durationMs, kind: inCycle ? 'pause' : 'hold' });
    else position = step.to;
    t += step.durationMs;
  };
  for (const item of script) {
    if (item.kind === 'cycle') {
      const startMs = t;
      for (const step of item.steps) push(step, true);
      cycleSpans.push({ startMs, endMs: t, label: item.label });
    } else {
      push(item, false);
    }
  }
  return { segments, cycleSpans, stills, durationMs: t };
}

/** Position (fraction of ROM) and its rate (fraction/s) at time t. */
function kinematics(segments: readonly Segment[], tMs: number): { p: number; v: number } {
  const seg = segments.find((s) => tMs >= s.startMs && tMs < s.endMs) ?? segments[segments.length - 1]!;
  const d = seg.step.durationMs;
  const tau = Math.min(1, Math.max(0, (tMs - seg.startMs) / d));
  if (seg.step.kind === 'hold') {
    const { tremorFraction: a, tremorHz: f } = seg.step;
    const w = 2 * Math.PI * f;
    const s = (tMs - seg.startMs) / 1000;
    return { p: seg.from + a * Math.sin(w * s), v: a * w * Math.cos(w * s) };
  }
  const delta = seg.step.to - seg.from;
  if (seg.step.profile === 'constant') return { p: seg.from + delta * tau, v: delta / (d / 1000) };
  return {
    p: seg.from + (delta * (1 - Math.cos(Math.PI * tau))) / 2,
    v: ((delta * Math.PI) / (2 * (d / 1000))) * Math.sin(Math.PI * tau),
  };
}

/** Gravity as seen by a sensor rotated by `angleRad` about `axis` (z up at angle 0). Matches the shared simulator. */
function gravityInSensorFrame(axis: AxisIndex, angleRad: number): [number, number, number] {
  const s = GRAVITY_M_S2 * Math.sin(angleRad);
  const c = GRAVITY_M_S2 * Math.cos(angleRad);
  if (axis === 0) return [0, s, c];
  if (axis === 1) return [-s, 0, c];
  return [0, 0, GRAVITY_M_S2];
}

/** 180° rotation about the axis after `axis`: inverts the rotation axis and one other axis (det = +1). */
function flip(axis: AxisIndex, v: readonly number[]): [number, number, number] {
  const other = (axis + 1) % 3;
  return [0, 1, 2].map((i) => (i === axis || i === other ? -v[i]! : v[i]!)) as [number, number, number];
}

export function generateScenario(script: readonly ScriptItem[], options: TrajectoryOptions): SyntheticScenarioTrace {
  const { segments, cycleSpans, stills, durationMs } = flatten(script);
  const rate = options.sampleRateHz ?? 50;
  const axis = options.axis ?? 0;
  const random = createRandom(options.seed ?? 1);
  const periodMs = 1000 / rate;
  const bias = options.gyroBiasRadS ?? [0, 0, 0];
  const end = Math.min(durationMs, options.truncateAtMs ?? Infinity);

  const samples: RawSensorSample[] = [];
  let lastT = -1;
  for (let k = 0; k * periodMs < end; k++) {
    const jitter = (options.timestampJitter ?? 0) * periodMs * (2 * random.next() - 1);
    const t = Math.max(lastT + 1, Math.round(k * periodMs + jitter));
    // Draw noise before the dropout decision so dropouts never shift the random stream.
    const gn = [0, 1, 2].map(() => (options.gyroNoiseRadS ?? 0) * random.gaussian());
    const an = [0, 1, 2].map(() => (options.accelNoiseMS2 ?? 0) * random.gaussian());
    if (t >= end) break;
    lastT = t;
    if (options.dropouts?.some(([a, b]) => t >= a && t < b)) continue;
    const { p, v } = kinematics(segments, t);
    const angle = p * options.romRad;
    const omega = v * options.romRad;
    let gyro: readonly number[] = [0, 1, 2].map((i) => (i === axis ? omega : 0));
    let accel: readonly number[] = gravityInSensorFrame(axis, angle);
    if (options.mountFlipped) {
      gyro = flip(axis, gyro);
      accel = flip(axis, accel);
    }
    samples.push({
      timestamp_ms: t,
      source_id: options.sourceId ?? 'synthetic-scenario-01',
      accel_m_s2: [accel[0]! + an[0]!, accel[1]! + an[1]!, accel[2]! + an[2]!],
      gyro_rad_s: [gyro[0]! + bias[0] + gn[0]!, gyro[1]! + bias[1] + gn[1]!, gyro[2]! + bias[2] + gn[2]!],
      quality_flags: ['synthetic'],
    });
  }

  const cycles: CycleLabel[] = cycleSpans.map((span) => {
    let peak = 0;
    let peakMs = span.startMs;
    for (let t = span.startMs; t <= span.endMs; t++) {
      const p = Math.abs(kinematics(segments, t).p);
      if (p > peak) {
        peak = p;
        peakMs = t;
      }
    }
    return {
      startMs: span.startMs,
      endMs: span.endMs,
      classification: span.label,
      peakFraction: peak,
      trueOutwardMs: (fraction: number) => {
        for (let t = span.startMs; t <= span.endMs; t++) if (Math.abs(kinematics(segments, t).p) >= fraction) return t;
        return Number.NaN;
      },
      trueReturnMs: (fraction: number) => {
        for (let t = peakMs; t <= span.endMs; t++) if (Math.abs(kinematics(segments, t).p) <= fraction) return t;
        return Number.NaN;
      },
    };
  });

  return { samples, cycles, stills, durationMs, synthetic: true };
}
