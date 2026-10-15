import type { AxisIndex, Vec3 } from '../common/types';
import type { RawSensorSample } from '../sensors/types';
import { createRandom, type Random } from './prng';

/** Standard gravity, m/s². */
export const GRAVITY_M_S2 = 9.80665;

/**
 * One segment of a scripted movement on a rotating mechanism (e.g. a pivoting
 * machine arm). Rotation is about a single sensor axis — the controlled,
 * rotational test-rig case the source of truth recommends starting with.
 */
export type MotionSegment =
  | { readonly kind: 'rest'; readonly durationMs: number }
  | {
      readonly kind: 'rep';
      readonly durationMs: number;
      /** Peak angular excursion of this rep, radians. */
      readonly amplitudeRad: number;
      /** Ground-truth label for evaluation. */
      readonly label: 'full' | 'partial';
    };

export interface MotionScript {
  readonly segments: readonly MotionSegment[];
  /** Repeat the script indefinitely (live simulation) instead of ending. */
  readonly loop?: boolean;
}

export interface SimulationOptions {
  readonly sourceId: string;
  readonly sampleRateHz: number;
  readonly seed: number;
  /** Rotation axis in the sensor frame. Default x (0). */
  readonly axis?: AxisIndex;
  /** Std-dev of white gyro noise, rad/s. */
  readonly gyroNoiseRadS?: number;
  /** Constant gyro bias added to every axis, rad/s (models uncalibrated offset). */
  readonly gyroBiasRadS?: Vec3;
  /** Std-dev of white accelerometer noise, m/s². */
  readonly accelNoiseMS2?: number;
  /** Probability [0,1) that any given sample is dropped (models packet loss). */
  readonly dropProbability?: number;
}

/** Ground-truth label for one scripted rep, in sensor timestamp milliseconds. */
export interface GroundTruthRep {
  readonly startMs: number;
  readonly endMs: number;
  readonly classification: 'full' | 'partial';
  readonly amplitudeRad: number;
}

interface Kinematics {
  angleRad: number;
  omegaRadS: number;
}

/** Raised-cosine excursion: 0 → amplitude → 0 over the segment. */
function repKinematics(tMs: number, durationMs: number, amplitudeRad: number): Kinematics {
  const phase = (2 * Math.PI * tMs) / durationMs;
  return {
    angleRad: (amplitudeRad * (1 - Math.cos(phase))) / 2,
    omegaRadS: ((amplitudeRad * Math.PI) / (durationMs / 1000)) * Math.sin(phase),
  };
}

function scriptDurationMs(script: MotionScript): number {
  return script.segments.reduce((sum, s) => sum + s.durationMs, 0);
}

/** Position in the script at time t, or undefined once a non-looping script has ended. */
function locate(script: MotionScript, tMs: number): { segment: MotionSegment; offsetMs: number } | undefined {
  const total = scriptDurationMs(script);
  if (total <= 0) return undefined;
  if (tMs >= total && !script.loop) return undefined;
  let t = script.loop ? tMs % total : tMs;
  for (const segment of script.segments) {
    if (t < segment.durationMs) return { segment, offsetMs: t };
    t -= segment.durationMs;
  }
  return undefined;
}

/**
 * Stateful sample synthesiser shared by the trace generator and the live
 * simulated sensor, so both produce identical signals for the same seed.
 */
export class MotionSynthesizer {
  private readonly random: Random;
  private readonly axis: AxisIndex;
  private index = 0;

  constructor(
    private readonly script: MotionScript,
    private readonly options: SimulationOptions,
  ) {
    this.random = createRandom(options.seed);
    this.axis = options.axis ?? 0;
  }

  get periodMs(): number {
    return 1000 / this.options.sampleRateHz;
  }

  /**
   * Produce the next sample, `null` if it was dropped (simulated packet loss),
   * or `undefined` when a non-looping script is finished.
   */
  next(): RawSensorSample | null | undefined {
    const timestampMs = Math.round(this.index * this.periodMs);
    this.index += 1;
    const position = locate(this.script, timestampMs);
    if (!position) return undefined;

    const { segment, offsetMs } = position;
    const k: Kinematics =
      segment.kind === 'rep'
        ? repKinematics(offsetMs, segment.durationMs, segment.amplitudeRad)
        : { angleRad: 0, omegaRadS: 0 };

    // Draw noise before the drop decision so dropping never shifts the random stream.
    const gyroNoise = this.options.gyroNoiseRadS ?? 0;
    const accelNoise = this.options.accelNoiseMS2 ?? 0;
    const bias = this.options.gyroBiasRadS ?? [0, 0, 0];
    const gyro = [0, 1, 2].map((i) => (i === this.axis ? k.omegaRadS : 0) + bias[i]! + gyroNoise * this.random.gaussian());
    const accel = gravityInSensorFrame(this.axis, k.angleRad).map((g) => g + accelNoise * this.random.gaussian());
    const dropped = this.random.next() < (this.options.dropProbability ?? 0);
    if (dropped) return null;

    return {
      timestamp_ms: timestampMs,
      source_id: this.options.sourceId,
      accel_m_s2: [accel[0]!, accel[1]!, accel[2]!],
      gyro_rad_s: [gyro[0]!, gyro[1]!, gyro[2]!],
      quality_flags: ['synthetic'],
    };
  }
}

/** Gravity vector as seen by a sensor rotated by `angleRad` about `axis` (starting flat, z up). */
function gravityInSensorFrame(axis: AxisIndex, angleRad: number): [number, number, number] {
  const s = GRAVITY_M_S2 * Math.sin(angleRad);
  const c = GRAVITY_M_S2 * Math.cos(angleRad);
  switch (axis) {
    case 0:
      return [0, s, c];
    case 1:
      return [-s, 0, c];
    case 2:
      return [0, 0, GRAVITY_M_S2];
  }
}

export interface SyntheticTrace {
  readonly samples: readonly RawSensorSample[];
  readonly labels: readonly GroundTruthRep[];
  readonly metadata: {
    readonly synthetic: true;
    readonly seed: number;
    readonly sampleRateHz: number;
    readonly axis: AxisIndex;
    readonly description?: string;
  };
}

/** Render a finite (non-looping) script into a labelled, reproducible trace. */
export function generateTrace(script: MotionScript, options: SimulationOptions, description?: string): SyntheticTrace {
  if (script.loop) throw new Error('generateTrace requires a non-looping script');
  const synth = new MotionSynthesizer(script, options);
  const samples: RawSensorSample[] = [];
  for (let sample = synth.next(); sample !== undefined; sample = synth.next()) {
    if (sample) samples.push(sample);
  }

  const labels: GroundTruthRep[] = [];
  let t = 0;
  for (const segment of script.segments) {
    if (segment.kind === 'rep') {
      labels.push({
        startMs: t,
        endMs: t + segment.durationMs,
        classification: segment.label,
        amplitudeRad: segment.amplitudeRad,
      });
    }
    t += segment.durationMs;
  }

  return {
    samples,
    labels,
    metadata: { synthetic: true, seed: options.seed, sampleRateHz: options.sampleRateHz, axis: options.axis ?? 0, description },
  };
}
