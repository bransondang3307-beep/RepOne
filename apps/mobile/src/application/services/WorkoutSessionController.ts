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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function startFailureOf(error: unknown): SensorError {
  const detail = error as { sensorError?: SensorError } | null;
  return detail?.sensorError ?? { code: 'start_failed', message: messageOf(error) };
}

/** One recording. Its outcome is decided from these fields alone, so a later session can never inherit it. */
interface Session {
  readonly id: string;
  readonly sensor: SensorSource;
  readonly detector: MotionDetector<RepEvent>;
  readonly unsubscribers: Unsubscribe[];
  buffer: RawSensorSample[];
  /** First failed write of this session. It outranks the sensor's reason: data may be missing. */
  writeError: string | null;
  /** Why the sensor failed, or why it could not start. */
  sensorError: SensorError | null;
  /** Set when finalisation begins; resolves once its outcome has been published. */
  released: Promise<void> | null;
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
 * and the session is marked ended. A stop or a finite stream ending gives `finished`; a sensor failure, a failed
 * start or a failed write gives `error`, keeping what was saved up to that point (ADR 0007). The controller stays
 * locked until finalisation has finished, and an outcome is only ever published to its own session's snapshot.
 */
export class WorkoutSessionController {
  private snapshot: SessionSnapshot = INITIAL;
  private readonly listeners = new Set<(s: SessionSnapshot) => void>();
  /** The session being recorded. */
  private active: Session | null = null;
  /** The session being finalised. */
  private releasing: Session | null = null;
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
    if (this.isBusy()) throw new Error('A session is already in progress');
    const { sensor, calibration } = params;
    const id = this.deps.createId();
    this.update({ ...INITIAL, status: 'starting', sessionId: id, provenance: sensor.provenance });

    let session: Session | null = null;
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

      const current: Session = {
        id,
        sensor,
        detector,
        unsubscribers: [],
        buffer: [],
        writeError: null,
        sensorError: null,
        released: null,
      };
      session = current;
      this.active = current;
      current.unsubscribers.push(
        sensor.subscribe((sample) => this.onSample(current, sample)),
        sensor.subscribeStatus((status) => this.onSensorStatus(current, status)),
      );
      this.update({ status: 'recording' });
      await sensor.start();
      // stop() may have won the race while start() was pending: don't leave the sensor streaming.
      if (current.released) await sensor.stop();
      return id;
    } catch (error) {
      if (session === null) this.update({ status: 'error', error: messageOf(error) });
      else await this.recordStartFailure(session, startFailureOf(error));
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.active) return this.finalize(this.active);
    await this.releasing?.released;
  }

  /** Clear a finished/errored snapshot back to idle. */
  reset(): void {
    if (this.isBusy()) throw new Error('Cannot reset while a session is in progress');
    this.update(INITIAL);
  }

  private isBusy(): boolean {
    return this.active !== null || this.releasing !== null || this.snapshot.status === 'starting';
  }

  private onSensorStatus(session: Session, status: SensorStatus): void {
    if (this.active !== session) return;
    // A finite source (e.g. replay) ending on its own finalises the session as finished.
    if (status === 'stopped') void this.finalize(session);
    else if (status === 'error') {
      session.sensorError ??= session.sensor.getLastError() ?? { code: 'unknown', message: 'no reason given' };
      void this.finalize(session);
    }
  }

  /**
   * start() rejected. The sensor normally publishes `error` first, which has already begun finalising; a
   * stop() may also have finalised the session while start() was pending. Either way the failure is this
   * session's outcome, and it is published only while this session still owns the snapshot.
   */
  private async recordStartFailure(session: Session, reason: SensorError): Promise<void> {
    session.sensorError ??= reason;
    await this.finalize(session);
    this.publishOutcome(session);
  }

  private finalize(session: Session): Promise<void> {
    if (session.released) return session.released;
    if (this.active === session) this.active = null;
    this.releasing = session;
    session.released = this.release(session);
    return session.released;
  }

  private async release(session: Session): Promise<void> {
    try {
      this.update({ status: 'stopping' });
      session.unsubscribers.forEach((u) => u());
      try {
        await session.sensor.stop();
      } catch (error) {
        session.sensorError ??= { code: 'unknown', message: `stopping the sensor failed: ${messageOf(error)}` };
      }
      this.flush(session);
      this.enqueue(session, () => this.deps.repositories.sessions.markEnded(session.id, this.deps.clock.now()));
      await this.writeQueue;
    } finally {
      this.releasing = null;
    }
    this.publishOutcome(session);
  }

  /** Publish the session's outcome, unless a newer session (or a reset) owns the snapshot by now. */
  private publishOutcome(session: Session): void {
    if (this.snapshot.sessionId !== session.id) return;
    const { sensorError, writeError } = session;
    const error = writeError ?? (sensorError ? describeSensorError(sensorError, this.snapshot.samplesReceived) : null);
    const status = error === null ? 'finished' : 'error';
    if (status === this.snapshot.status && error === this.snapshot.error && sensorError === this.snapshot.sensorError) return;
    this.update({ status, error, sensorError });
  }

  private onSample(session: Session, sample: RawSensorSample): void {
    session.buffer.push(sample);
    if (session.buffer.length >= this.batchSize) this.flush(session);

    const events = session.detector.push(sample);
    let { fullReps, partialReps } = this.snapshot;
    for (const event of events) {
      this.enqueue(session, () => this.deps.repositories.repEvents.append(event));
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

  private flush(session: Session): void {
    if (session.buffer.length === 0) return;
    const batch = session.buffer;
    session.buffer = [];
    this.enqueue(session, () => this.deps.repositories.rawSamples.appendBatch(session.id, batch));
  }

  private enqueue(session: Session, write: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(write).catch((error: unknown) => this.writeFailed(session, error));
  }

  private writeFailed(session: Session, error: unknown): void {
    session.writeError ??= messageOf(error);
    // A recording whose writes fail cannot be trusted: stop it rather than keep collecting unsaved samples.
    // While finalising, nothing is published early; the outcome is published when finalisation ends.
    if (this.active === session) void this.finalize(session);
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
