import type { MotionDetector, RawSensorSample, RepCalibration, RepEvent } from '@repone/sensor-contracts';
import { RotationalRepDetector, type RotationalRepDetectorConfig } from './RotationalRepDetector';

/** A rep event attributed to the channel — one physical IMU, identified by its `source_id` — it was detected on. */
export interface ChannelRepEvent {
  readonly source_id: string;
  readonly event: RepEvent;
}

export type ChannelDetectorFactory = (sessionId: string, calibration: RepCalibration) => MotionDetector<RepEvent>;

export interface MultiChannelRepDetectorOptions {
  /** Calibration of each channel, keyed by `source_id`. Only these channels are detected. */
  readonly calibrations: ReadonlyMap<string, RepCalibration>;
  /** Default: the rotational detector with `config`. Every channel must report the same algorithm version. */
  readonly createDetector?: ChannelDetectorFactory;
  /** Passed to the default rotational detector. */
  readonly config?: Partial<RotationalRepDetectorConfig>;
}

/**
 * Per-channel rep engine (ADR 0007 §3). Each channel gets its own detector with its own calibration, and
 * samples are routed by `source_id`. A gap, failure, noise or a different clock on one channel therefore
 * never reaches another channel's detector. The algorithm is unchanged: each channel runs exactly the
 * single-channel detector, so one channel through this wrapper gives the bare detector's events.
 */
export class MultiChannelRepDetector implements MotionDetector<ChannelRepEvent> {
  readonly algorithmVersion: string;
  private readonly detectors = new Map<string, MotionDetector<RepEvent>>();
  private readonly ignored = new Map<string, number>();

  constructor(sessionId: string, options: MultiChannelRepDetectorOptions) {
    if (options.calibrations.size === 0) throw new Error('At least one channel calibration is required');
    const create =
      options.createDetector ??
      ((id: string, calibration: RepCalibration) => new RotationalRepDetector(id, calibration, options.config));
    for (const [sourceId, calibration] of options.calibrations) {
      this.detectors.set(sourceId, create(sessionId, calibration));
    }
    const versions = new Set([...this.detectors.values()].map((d) => d.algorithmVersion));
    if (versions.size !== 1) throw new Error(`Channels must share one algorithm version, got ${[...versions].join(', ')}`);
    this.algorithmVersion = [...versions][0]!;
  }

  /** The detected channels' `source_id`s, in calibration order. */
  get channels(): readonly string[] {
    return [...this.detectors.keys()];
  }

  push(sample: RawSensorSample): ChannelRepEvent[] {
    const detector = this.detectors.get(sample.source_id);
    if (!detector) {
      this.ignored.set(sample.source_id, (this.ignored.get(sample.source_id) ?? 0) + 1);
      return [];
    }
    return detector.push(sample).map((event) => ({ source_id: sample.source_id, event }));
  }

  /** Reset every channel. */
  reset(): void {
    for (const detector of this.detectors.values()) detector.reset();
  }

  /** Reset one channel (e.g. after its sensor reconnects) without touching the others. */
  resetChannel(sourceId: string): void {
    this.detectors.get(sourceId)?.reset();
  }

  /** Samples received from channels without a calibration, per `source_id`. They are never detected. */
  ignoredSampleCounts(): ReadonlyMap<string, number> {
    return new Map(this.ignored);
  }
}
