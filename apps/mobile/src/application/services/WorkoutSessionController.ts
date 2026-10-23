import type {
  Clock,
  DataProvenance,
  IdGenerator,
  MotionDetector,
  RawSensorSample,
  RepCalibration,
  RepEvent,
  SensorError,
  SensorErrorCode,
  SensorSource,
  SensorStatus,
  Unsubscribe,
} from '@repone/sensor-contracts';
import type { Repositories } from '@repone/workout-domain';

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
  /** Why the sensor failed, when it did (ADR 0007). `error` holds the matching message. */
  readonly sensorError: SensorError | null;
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
  sensorError: null,
};

const SENSOR_ERROR_TEXT: Record<SensorErrorCode, string> = {
  start_failed: 'The sensor could not start',
  connection_lost: 'The sensor connection was lost',
  stream_timeout: 'The sensor stopped sending data',
  invalid_data: 'The sensor sent data that could not be read',
  unknown: 'The sensor reported an error',
};

function describeSensorError(error: SensorError, samplesReceived: number): string {
  const saved =
    samplesReceived === 0 ? 'No samples were recorded.' : `The ${samplesReceived} samples received before the failure were saved.`;
  return `${SENSOR_ERROR_TEXT[error.code]} (${error.message}). ${saved}`;
}

function startFailureOf(error: unknown): SensorError {
  const detail = error as { sensorError?: SensorError } | null;
  return detail?.sensorError ?? { code: 'start_failed', message: error instanceof Error ? error.message : String(error) };
}

interface ActiveSession {
  readonly id: string;
  readonly sensor: SensorSource;
  readonly detector: MotionDetector<RepEvent>;
  readonly unsubscribers: Unsubscribe[];
  buffer: RawSensorSample[];
}

/**
 * Orchestrates one recording at a time: sensor → raw-sample store → detector →
 * event store, and publishes a UI-agnostic snapshot. Application service: no
 * React, React Native or infrastructure imports — everything is injected.
 *
 * Sensor callbacks are synchronous; all writes go through a single ordered
 * queue so persistence order matches sample order.
 *
 * Every way a recording ends goes through `finalize`: the sensor is released, buffered samples are flushed
 * and the session is marked ended. A stop or a finite stream ending gives `finished`; a sensor failure or a
 * failed write gives `error`, keeping what was saved up to that point (ADR 0007).
 */
export class WorkoutSessionController {
  private snapshot: SessionSnapshot = INITIAL;
  private readonly listeners = new Set<(s: SessionSnapshot) => void>();
  private active: ActiveSession | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private finalizing: Promise<void> = Promise.resolve();
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

    let active: ActiveSession | null = null;
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

      const current: ActiveSession = { id, sensor, detector, unsubscribers: [], buffer: [] };
      active = current;
      this.active = current;
      current.unsubscribers.push(
        sensor.subscribe((sample) => this.onSample(current, sample)),
        sensor.subscribeStatus((status) => this.onSensorStatus(current, status)),
      );
      this.update({ status: 'recording' });
      await sensor.start();
      return id;
    } catch (error) {
      if (active === null) this.fail(error);
      // The sensor normally publishes `error` before rejecting, which has already begun finalising.
      else if (this.active === active) await this.finalize(active, startFailureOf(error));
      else await this.finalizing;
      throw error;
    }
  }

  async stop(): Promise<void> {
    const active = this.active;
    if (!active) return this.finalizing;
    return this.finalize(active, null);
  }

  /** Clear a finished/errored snapshot back to idle. */
  reset(): void {
    const { status } = this.snapshot;
    if (this.active || status === 'starting' || status === 'stopping') throw new Error('Cannot reset while recording');
    this.update(INITIAL);
  }

  private onSensorStatus(active: ActiveSession, status: SensorStatus): void {
    if (this.active !== active) return;
    // A finite source (e.g. replay) ending on its own finalises the session as finished.
    if (status === 'stopped') void this.finalize(active, null);
    else if (status === 'error') {
      void this.finalize(active, active.sensor.getLastError() ?? { code: 'unknown', message: 'no reason given' });
    }
  }

  private finalize(active: ActiveSession, sensorError: SensorError | null): Promise<void> {
    if (this.active !== active) return this.finalizing;
    this.active = null;
    this.finalizing = this.release(active, sensorError);
    return this.finalizing;
  }

  private async release(active: ActiveSession, sensorError: SensorError | null): Promise<void> {
    this.update({ status: 'stopping' });
    active.unsubscribers.forEach((u) => u());
    await active.sensor.stop();
    this.flush(active);
    this.enqueue(() => this.deps.repositories.sessions.markEnded(active.id, this.deps.clock.now()));
    await this.writeQueue;
    // A failed write (already in `error`) outranks the sensor's reason: it means data may be missing.
    const error =
      this.snapshot.error ?? (sensorError ? describeSensorError(sensorError, this.snapshot.samplesReceived) : null);
    this.update({ status: error === null ? 'finished' : 'error', error, sensorError });
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
    // A recording whose writes fail cannot be trusted: stop it rather than keep collecting unsaved samples.
    if (this.active) void this.finalize(this.active, null);
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
