import type { Clock, DataProvenance, IdGenerator, Unsubscribe } from '../common/types';
import type { RepCalibration } from '../processing/calibration';
import type { MotionDetector, RepEvent } from '../processing/events';
import type { Repositories } from '../persistence/types';
import type { RawSensorSample, SensorSource } from '../sensors/types';

export type SessionStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'finished' | 'error';

export interface SessionSnapshot {
  readonly status: SessionStatus;
  readonly sessionId: string | null;
  readonly provenance: DataProvenance | null;
  readonly fullReps: number;
  readonly partialReps: number;
  readonly samplesReceived: number;
  readonly lastEvent: RepEvent | null;
  readonly error: string | null;
}

export type DetectorFactory = (sessionId: string, calibration: RepCalibration) => MotionDetector<RepEvent>;

export interface WorkoutSessionControllerDeps {
  readonly repositories: Repositories;
  readonly clock: Clock;
  readonly createId: IdGenerator;
  readonly createDetector: DetectorFactory;
  /** Raw samples are persisted in batches of this size. Default 50. */
  readonly rawSampleBatchSize?: number;
}

export interface StartSessionParams {
  readonly sensor: SensorSource;
  readonly calibration: RepCalibration;
  readonly machineLabel?: string | null;
}

const INITIAL: SessionSnapshot = {
  status: 'idle',
  sessionId: null,
  provenance: null,
  fullReps: 0,
  partialReps: 0,
  samplesReceived: 0,
  lastEvent: null,
  error: null,
};

interface ActiveSession {
  readonly id: string;
  readonly sensor: SensorSource;
  readonly detector: MotionDetector<RepEvent>;
  readonly unsubscribers: Unsubscribe[];
  buffer: RawSensorSample[];
}

/**
 * Orchestrates one recording at a time: sensor → raw-sample store → detector →
 * event store, and publishes a UI-agnostic snapshot. Contains no React code.
 *
 * Sensor callbacks are synchronous; all writes go through a single ordered
 * queue so persistence order matches sample order.
 */
export class WorkoutSessionController {
  private snapshot: SessionSnapshot = INITIAL;
  private readonly listeners = new Set<(s: SessionSnapshot) => void>();
  private active: ActiveSession | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly batchSize: number;

  constructor(private readonly deps: WorkoutSessionControllerDeps) {
    this.batchSize = deps.rawSampleBatchSize ?? 50;
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: SessionSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(params: StartSessionParams): Promise<string> {
    if (this.active || this.snapshot.status === 'starting' || this.snapshot.status === 'stopping') {
      throw new Error('A session is already in progress');
    }
    const { sensor, calibration } = params;
    const id = this.deps.createId();
    this.update({ ...INITIAL, status: 'starting', sessionId: id, provenance: sensor.provenance });

    try {
      const { repositories, clock } = this.deps;
      await repositories.calibrations.save(calibration);
      const detector = this.deps.createDetector(id, calibration);
      await repositories.sessions.create({
        id,
        activity_type: 'gym',
        provenance: sensor.provenance,
        source_id: sensor.id,
        source_kind: sensor.kind,
        calibration_id: calibration.calibration_id,
        algorithm_version: detector.algorithmVersion,
        machine_label: params.machineLabel ?? null,
        started_at_epoch_ms: clock.now(),
        ended_at_epoch_ms: null,
      });

      const active: ActiveSession = { id, sensor, detector, unsubscribers: [], buffer: [] };
      this.active = active;
      active.unsubscribers.push(
        sensor.subscribe((sample) => this.onSample(active, sample)),
        sensor.subscribeStatus((status) => {
          // A finite source (e.g. replay) ending on its own finalises the session.
          if ((status === 'stopped' || status === 'error') && this.active === active) void this.stop();
        }),
      );
      this.update({ status: 'recording' });
      await sensor.start();
      return id;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.update({ status: 'stopping' });
    active.unsubscribers.forEach((u) => u());
    await active.sensor.stop();
    this.flush(active);
    this.enqueue(() => this.deps.repositories.sessions.markEnded(active.id, this.deps.clock.now()));
    await this.writeQueue;
    if (this.snapshot.status !== 'error') this.update({ status: 'finished' });
  }

  /** Clear a finished/errored snapshot back to idle. */
  reset(): void {
    if (this.active) throw new Error('Cannot reset while recording');
    this.update(INITIAL);
  }

  private onSample(active: ActiveSession, sample: RawSensorSample): void {
    active.buffer.push(sample);
    if (active.buffer.length >= this.batchSize) this.flush(active);

    const events = active.detector.push(sample);
    let { fullReps, partialReps } = this.snapshot;
    for (const event of events) {
      this.enqueue(() => this.deps.repositories.repEvents.append(event));
      if (event.classification === 'full') fullReps += 1;
      else partialReps += 1;
    }
    const samplesReceived = this.snapshot.samplesReceived + 1;
    // Publish on rep events and once per batch, not on every sample, to keep UI churn low.
    if (events.length > 0 || samplesReceived % this.batchSize === 0) {
      this.update({ fullReps, partialReps, samplesReceived, lastEvent: events.at(-1) ?? this.snapshot.lastEvent });
    } else {
      this.snapshot = { ...this.snapshot, samplesReceived };
    }
  }

  private flush(active: ActiveSession): void {
    if (active.buffer.length === 0) return;
    const batch = active.buffer;
    active.buffer = [];
    this.enqueue(() => this.deps.repositories.rawSamples.appendBatch(active.id, batch));
  }

  private enqueue(write: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(write).catch((error: unknown) => this.fail(error));
  }

  private fail(error: unknown): void {
    this.update({ status: 'error', error: error instanceof Error ? error.message : String(error) });
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
