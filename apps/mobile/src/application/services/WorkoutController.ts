import type { Clock, IdGenerator, RepCalibration, SensorSource, Unsubscribe } from '@repone/sensor-contracts';
import {
  WorkoutRuleError,
  addExercise,
  addSet,
  beginSetRecording,
  endSetRecording,
  enterResistance,
  finishWorkout,
  newExercise,
  newMachine,
  newWorkout,
  pauseWorkout,
  resumeWorkout,
  setResistance,
  startWorkout,
  type Exercise,
  type Machine,
  type MassUnit,
  type MotionType,
  type Repositories,
  type SessionOutcome,
  type SetResult,
  type WorkoutRecord,
  type WorkoutSet,
} from '@repone/workout-domain';
import type { SessionSnapshot, StartSessionParams } from './WorkoutSessionController';

/**
 * What the workout controller needs from the recording controller (`WorkoutSessionController`). Narrow on purpose:
 * tests can drive the event order directly. Like `WorkoutSessionController`, an implementation publishes `starting`
 * with the new session id synchronously inside `start()`, and publishes a terminal snapshot (`finished` / `error`)
 * for that session before `start()` rejects or after the recording ends.
 */
export interface SetRecorder {
  start(params: StartSessionParams): Promise<string>;
  stop(): Promise<void>;
  isBusy(): boolean;
  getSnapshot(): SessionSnapshot;
  subscribe(listener: (snapshot: SessionSnapshot) => void): Unsubscribe;
}

export interface WorkoutControllerDeps {
  readonly repositories: Repositories;
  readonly recorder: SetRecorder;
  readonly clock: Clock;
  readonly createId: IdGenerator;
  /** The same sensor choice quick sets use (simulated or real). */
  readonly getSessionSensor: () => Promise<SensorSource>;
  readonly getCalibration: () => RepCalibration;
}

/** Errors that come from the controller, not the domain rules. */
export type WorkoutControllerErrorCode = 'no_workout' | 'recorder_busy' | 'unknown_set';

export class WorkoutControllerError extends Error {
  constructor(
    readonly code: WorkoutControllerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkoutControllerError';
  }
}

/** A recorded set once it is saved as completed (plan §3a). */
export interface SettledSet {
  readonly set: WorkoutSet;
  /** Reps and provenance of the set's recording, read back from storage. */
  readonly result: SetResult;
  /** Why the recording ended; null if the recording stored none. */
  readonly outcome: SessionOutcome | null;
  /** The recording controller's error message (a sensor failure, a failed start), or null. */
  readonly error: string | null;
}

export interface RecordSetHandle {
  /** The recording (`workout_sessions.id`) the set is linked to. */
  readonly sessionId: string;
  /**
   * Resolves once the completed set is saved, its results are refreshed and the lock is released. Rejects if that
   * save fails: the lock is then kept until `retryPendingSave()` (or the next change) saves it.
   */
  readonly settled: Promise<SettledSet>;
}

export interface WorkoutSnapshot {
  /** The workout as last saved; null before `create()` or `load()`. */
  readonly record: WorkoutRecord | null;
  /** The set being recorded. While it is set, pausing, finishing and recording another set are refused. */
  readonly recordingSetId: string | null;
  /** Each set with its reps and provenance, as of the last refresh. */
  readonly setResults: readonly SetResult[];
  /** A completed set could not be saved; `retryPendingSave()` tries again. */
  readonly pendingSave: boolean;
  /** The last error to show the user, or null. */
  readonly error: string | null;
}

const INITIAL: WorkoutSnapshot = { record: null, recordingSetId: null, setResults: [], pendingSave: false, error: null };

/** Used only to check the recording rules before a recording exists (plan §3 step 1). */
const PLACEHOLDER_SESSION_ID = '__not-yet-recorded__';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A caller may drop `settled`; its rejection is still reported through the snapshot.
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** One attempt to record one set (plan §3 step 2). */
interface Attempt {
  readonly setId: string;
  /** From the recording controller's `starting` snapshot. */
  sessionId: string | null;
  /** The recording's terminal snapshot (`finished` / `error`), buffered until the set is linked. */
  terminal: SessionSnapshot | null;
  /** `start()` resolved or rejected: a late start failure can no longer change the outcome. */
  startSettled: boolean;
  /** The link step ran (its save may have failed: the set is then still planned). */
  linkDone: boolean;
  /** `stopSet()` was called before the recording existed. */
  stopRequested: boolean;
  /** True only during the synchronous part of this attempt's `recorder.start()` call. */
  capturing: boolean;
  completionQueued: boolean;
  /** The completion save failed; the lock is kept until a retry succeeds. */
  saveFailed: boolean;
  completed: boolean;
  unsubscribe: Unsubscribe | null;
  readonly settled: Deferred<SettledSet>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const lockError = (what: string) =>
  new WorkoutRuleError('set_recording', `Stop the set that is recording before you ${what}`);

/**
 * Runs one workout through the ADR 0010 lifecycle and records its sets through the recording controller (RO-014
 * PR 1; docs/plans/RO-014-pr1-workout-controller.md). Application service: no React or infrastructure imports.
 *
 * - The domain functions enforce the rules; this class only sequences them and persists the result.
 * - Every change runs as one short step on one queue: a domain function, one save, then the in-memory record. A
 *   refusal or a failed save leaves both the stored and the in-memory record unchanged (§3b).
 * - Recording a set is split so that nothing waits on the sensor while holding the queue: check and lock (queued),
 *   start the recording (not queued), link the set (queued), complete it once (queued).
 * - While a set records, `pause()`, `finish()`, `recordSet()`, `create()` and `load()` are refused at once.
 * - Quick sets are untouched: they use the recording controller directly and stay standalone.
 */
export class WorkoutController {
  private snapshot: WorkoutSnapshot = INITIAL;
  private readonly listeners = new Set<(snapshot: WorkoutSnapshot) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private attempt: Attempt | null = null;

  constructor(private readonly deps: WorkoutControllerDeps) {}

  getSnapshot(): WorkoutSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: WorkoutSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- Exercises and machines (no workout state) ---------------------------------------------------------------

  /** Create an exercise, optionally with a new machine linked to it. */
  async createExercise(
    name: string,
    machine?: { readonly name: string; readonly motion_type: MotionType; readonly notes?: string | null },
  ): Promise<{ exercise: Exercise; machine: Machine | null }> {
    const { repositories, clock, createId } = this.deps;
    const now = clock.now();
    const exercise = newExercise({ id: createId(), name, nowEpochMs: now });
    const created = machine
      ? newMachine({ id: createId(), name: machine.name, motionType: machine.motion_type, notes: machine.notes ?? null, nowEpochMs: now })
      : null;
    await repositories.exercises.save(exercise);
    if (created) {
      await repositories.machines.save(created);
      await repositories.exercises.link(exercise.id, created.id);
    }
    return { exercise, machine: created };
  }

  listExercises(): Promise<Exercise[]> {
    return this.deps.repositories.exercises.list();
  }

  machinesFor(exerciseId: string): Promise<Machine[]> {
    return this.deps.repositories.exercises.machinesFor(exerciseId);
  }

  /**
   * The unit of the newest entered resistance in recent workouts (decision 2), 'kg' if there is none. Reads
   * existing queries only.
   */
  async defaultResistanceUnit(): Promise<MassUnit> {
    const { workouts } = this.deps.repositories;
    for (const summary of await workouts.listRecent(5)) {
      const record = await workouts.getById(summary.workout.id);
      const withResistance = record?.sets.filter((s) => s.resistance !== null) ?? [];
      const newest = withResistance[withResistance.length - 1];
      if (newest?.resistance) return newest.resistance.entered_unit;
    }
    return 'kg';
  }

  // --- Choosing the workout --------------------------------------------------------------------------------------

  /** Start a new, planned workout and make it current. */
  create(): Promise<WorkoutRecord> {
    return this.mutate('start another workout', async () => {
      const next = newWorkout(this.deps.createId(), this.deps.clock.now());
      await this.deps.repositories.workouts.save(next);
      this.update({ record: next, setResults: [], error: null });
      return next;
    });
  }

  /**
   * Make a stored workout current. A set left `recording` by an app that stopped mid-recording is completed: it
   * keeps what its recording saved (plan §3, open point for review).
   */
  load(workoutId: string): Promise<WorkoutRecord | null> {
    return this.mutate('open another workout', async () => {
      const { workouts, sessions } = this.deps.repositories;
      let record = await workouts.getById(workoutId);
      if (!record) return null;
      let error: string | null = null;
      const orphaned = record.sets.filter((s) => s.status === 'recording');
      for (const set of orphaned) {
        const recording = set.recording_session_id ? await sessions.getById(set.recording_session_id) : null;
        if (recording?.ended_at_epoch_ms === null) error = 'A set was interrupted while recording; what it saved is kept.';
        record = endSetRecording(record, set.id);
      }
      if (orphaned.length > 0) await workouts.save(record);
      this.update({ record, setResults: await workouts.listSetResults(record.workout.id), error });
      return record;
    });
  }

  /** Open the most recent workout if it is not finished. */
  async resumeLatest(): Promise<WorkoutRecord | null> {
    const [latest] = await this.deps.repositories.workouts.listRecent(1);
    if (!latest || latest.workout.status === 'finished') return null;
    return this.load(latest.workout.id);
  }

  // --- Building the workout --------------------------------------------------------------------------------------

  /** Append an exercise (optionally on a machine); returns the workout exercise's id. */
  addExercise(exerciseId: string, machineId?: string | null): Promise<string> {
    return this.mutate(null, async () => {
      const id = this.deps.createId();
      await this.save(addExercise(this.requireRecord(), { id, exerciseId, machineId: machineId ?? null }));
      return id;
    });
  }

  /** Append a planned set, prefilled with the resistance entered the last time this exercise was recorded. */
  addSet(workoutExerciseId: string): Promise<string> {
    return this.mutate(null, async () => {
      const record = this.requireRecord();
      const exercise = record.exercises.find((e) => e.id === workoutExerciseId);
      const [last] = exercise ? await this.deps.repositories.workouts.listExerciseHistory(exercise.exercise_id, 1) : [];
      const id = this.deps.createId();
      await this.save(addSet(record, { id, workoutExerciseId, resistance: last?.resistance ?? null }));
      return id;
    });
  }

  /** Set the user-entered resistance of a set, or clear it with `null`. */
  setResistance(setId: string, value: number | null, unit: MassUnit): Promise<void> {
    return this.mutate(null, async () => {
      const resistance = value === null ? null : enterResistance(value, unit);
      await this.save(setResistance(this.requireRecord(), setId, resistance));
    });
  }

  // --- Lifecycle -------------------------------------------------------------------------------------------------

  start(): Promise<void> {
    return this.mutate(null, () => this.save(startWorkout(this.requireRecord(), this.deps.clock.now())));
  }

  /** Pause between sets (decision 5): refused while a set is starting, recording or not yet saved. */
  pause(): Promise<void> {
    return this.mutate('pause the workout', () => this.save(pauseWorkout(this.requireRecord(), this.deps.clock.now())));
  }

  resume(): Promise<void> {
    return this.mutate(null, () => this.save(resumeWorkout(this.requireRecord(), this.deps.clock.now())));
  }

  finish(): Promise<void> {
    return this.mutate('finish the workout', () => this.save(finishWorkout(this.requireRecord(), this.deps.clock.now())));
  }

  // --- Recording a set (plan §3) ---------------------------------------------------------------------------------

  /**
   * Record a planned set with the chosen sensor. Resolves once the recording has started and the set is linked to
   * it (or, if the recording failed to start after it was created, once the set is linked and will complete). Rejects
   * if the set may not be recorded, or if no recording could be created; the set then stays planned.
   */
  async recordSet(setId: string): Promise<RecordSetHandle> {
    const attempt = await this.mutate('record another set', async () => {
      const record = this.requireRecord();
      beginSetRecording(record, setId, PLACEHOLDER_SESSION_ID); // the rules only; nothing is saved
      if (this.deps.recorder.isBusy()) throw new WorkoutControllerError('recorder_busy', 'Finish the quick set first.');
      const created: Attempt = {
        setId,
        sessionId: null,
        terminal: null,
        startSettled: false,
        linkDone: false,
        stopRequested: false,
        capturing: false,
        completionQueued: false,
        saveFailed: false,
        completed: false,
        unsubscribe: null,
        settled: deferred<SettledSet>(),
      };
      this.attempt = created;
      this.update({ recordingSetId: setId, error: null });
      return created;
    });
    // The queue is free from here on: a pending start() blocks nothing (§3b).
    return this.startAttempt(attempt);
  }

  /**
   * Stop the set that is recording. Idempotent; a no-op when nothing records. It only ever stops this set's own
   * recording: once that has ended (for example while its save is retried), a quick set started since is left alone.
   */
  async stopSet(): Promise<void> {
    const attempt = this.attempt;
    if (!attempt) return;
    attempt.stopRequested = true;
    await this.stopOwnRecording(attempt);
  }

  /** Save a completed set whose save failed (plan §3b). Resolves with the set once it is saved. */
  retryPendingSave(): Promise<SettledSet | null> {
    return this.run(async () => {
      const attempt = this.attempt;
      if (!attempt?.saveFailed) return null;
      return this.complete(attempt);
    });
  }

  // --- Internals -------------------------------------------------------------------------------------------------

  private async startAttempt(attempt: Attempt): Promise<RecordSetHandle> {
    const { recorder, repositories } = this.deps;
    attempt.unsubscribe = recorder.subscribe((snapshot) => this.onRecorderSnapshot(attempt, snapshot));
    let startError: unknown = null;
    try {
      const sensor = await this.deps.getSessionSensor();
      const machineLabel = await this.machineLabelFor(attempt.setId);
      // start() publishes `starting` with the new session id synchronously, before its first await (§3 step 2). The
      // id is taken only inside that window, so a quick set started meanwhile can never be mistaken for this set's.
      attempt.capturing = true;
      const started = recorder.start({ sensor, calibration: this.deps.getCalibration(), machineLabel });
      attempt.capturing = false;
      const startedId = await started;
      attempt.sessionId ??= startedId;
      if (attempt.stopRequested) await this.stopOwnRecording(attempt);
    } catch (error) {
      startError = error;
    }
    attempt.startSettled = true;

    const rowExists = attempt.sessionId !== null && (startError === null || (await this.recordingExists(attempt.sessionId)));
    if (!rowExists) {
      // No recording exists: the set stays planned and the lock is released (§3 step 6).
      attempt.unsubscribe?.();
      if (this.attempt === attempt) this.attempt = null;
      this.update({ recordingSetId: null, error: messageOf(startError) });
      attempt.settled.reject(startError);
      throw startError;
    }
    // A failed start always ends the recording; if no terminal snapshot was seen, the failure itself is the outcome.
    if (startError !== null) attempt.terminal ??= { ...recorder.getSnapshot(), status: 'error', sessionId: attempt.sessionId, error: messageOf(startError) };
    await this.run(() => this.link(attempt));
    this.maybeComplete(attempt);
    return { sessionId: attempt.sessionId!, settled: attempt.settled.promise };
  }

  /**
   * The recording controller is shared with quick sets, and its `stop()` stops whatever records now. Stop it only
   * while the recording running is this attempt's own (Codex P1 on PR #45).
   */
  private async stopOwnRecording(attempt: Attempt): Promise<void> {
    const current = this.deps.recorder.getSnapshot();
    if (attempt.sessionId === null || current.sessionId !== attempt.sessionId) return;
    if (current.status === 'finished' || current.status === 'error' || current.status === 'idle') return;
    await this.deps.recorder.stop();
  }

  /** Whether a failed start left a recording row. If that cannot be read, none is assumed: the set stays planned. */
  private async recordingExists(sessionId: string): Promise<boolean> {
    try {
      return (await this.deps.repositories.sessions.getById(sessionId)) !== null;
    } catch {
      return false;
    }
  }

  private async machineLabelFor(setId: string): Promise<string | null> {
    const record = this.requireRecord();
    const set = record.sets.find((s) => s.id === setId);
    const entry = record.exercises.find((e) => e.id === set?.workout_exercise_id);
    if (!entry) return null;
    const { exercises, machines } = this.deps.repositories;
    const exercise = await exercises.getById(entry.exercise_id);
    const machine = entry.machine_id ? await machines.getById(entry.machine_id) : null;
    return [exercise?.name, machine?.name].filter((part): part is string => !!part).join(' · ') || null;
  }

  private onRecorderSnapshot(attempt: Attempt, snapshot: SessionSnapshot): void {
    if (attempt.completed) return;
    if (attempt.sessionId === null) {
      if (attempt.capturing && snapshot.status === 'starting' && snapshot.sessionId !== null) attempt.sessionId = snapshot.sessionId;
      return;
    }
    // Snapshots of any other recording (a quick set, an earlier attempt, a reset) are ignored (§3b).
    if (snapshot.sessionId !== attempt.sessionId) return;
    if (snapshot.status === 'finished' || snapshot.status === 'error') {
      // A second terminal snapshot (a late start failure replacing `stopped`) replaces the first; completion waits
      // for start() to settle, so the final one is used.
      attempt.terminal = snapshot;
      this.maybeComplete(attempt);
    }
  }

  /** §3 step 3. A failed link save leaves the set planned; completion then links and completes it in one save. */
  private async link(attempt: Attempt): Promise<void> {
    try {
      await this.save(beginSetRecording(this.requireRecord(), attempt.setId, attempt.sessionId!));
    } catch (error) {
      this.update({ error: `The set could not be saved yet (${messageOf(error)}); it will be saved when the recording ends.` });
    }
    attempt.linkDone = true;
  }

  /** §3 step 4: once the set is linked and the recording has ended and start() has settled, complete it once. */
  private maybeComplete(attempt: Attempt): void {
    if (attempt.completed || attempt.completionQueued || attempt.saveFailed) return;
    if (!attempt.linkDone || !attempt.startSettled || attempt.terminal === null) return;
    attempt.completionQueued = true;
    void this.run(() => this.complete(attempt)).catch(() => undefined);
  }

  private async complete(attempt: Attempt): Promise<SettledSet> {
    const { workouts, sessions } = this.deps.repositories;
    let next: WorkoutRecord;
    try {
      next = this.requireRecord();
      if (next.sets.find((s) => s.id === attempt.setId)?.status === 'planned') {
        next = beginSetRecording(next, attempt.setId, attempt.sessionId!);
      }
      next = endSetRecording(next, attempt.setId);
      await workouts.save(next);
    } catch (error) {
      // The lock is kept: the workout cannot pause or finish around an unsaved set (§3b).
      attempt.saveFailed = true;
      attempt.completionQueued = false;
      this.update({ pendingSave: true, error: `The recorded set could not be saved: ${messageOf(error)}` });
      attempt.settled.reject(error);
      throw error;
    }
    attempt.completed = true;
    attempt.saveFailed = false;
    attempt.unsubscribe?.();
    this.attempt = null;
    const error = attempt.terminal?.error ?? null;
    try {
      const setResults = await workouts.listSetResults(next.workout.id);
      const outcome = await sessions.getOutcome(attempt.sessionId!);
      this.update({ record: next, recordingSetId: null, setResults, pendingSave: false, error });
      const result = setResults.find((r) => r.set.id === attempt.setId);
      if (!result) throw new WorkoutControllerError('unknown_set', 'The recorded set was not found after saving it');
      const settled: SettledSet = { set: result.set, result, outcome, error };
      attempt.settled.resolve(settled);
      return settled;
    } catch (readError) {
      // Saved, so the lock is released; only the refresh failed.
      this.update({ record: next, recordingSetId: null, pendingSave: false, error: messageOf(readError) });
      attempt.settled.reject(readError);
      throw readError;
    }
  }

  /**
   * One change to the workout (§3b). `refuseWhileRecording` names the action refused while a set records: that check
   * runs when called (nothing is enqueued) and again at the head of the step. A completed set whose save failed is
   * saved first.
   */
  private mutate<T>(refuseWhileRecording: string | null, step: () => Promise<T>): Promise<T> {
    if (refuseWhileRecording !== null && this.attempt !== null && !this.attempt.saveFailed) {
      return Promise.reject(lockError(refuseWhileRecording));
    }
    return this.run(async () => {
      if (this.attempt?.saveFailed) await this.complete(this.attempt);
      if (refuseWhileRecording !== null && this.attempt !== null) throw lockError(refuseWhileRecording);
      return step();
    });
  }

  private run<T>(step: () => Promise<T>): Promise<T> {
    const result = this.queue.then(step);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Save first; only then does the in-memory record change. */
  private async save(next: WorkoutRecord): Promise<void> {
    await this.deps.repositories.workouts.save(next);
    this.update({ record: next });
  }

  private requireRecord(): WorkoutRecord {
    const { record } = this.snapshot;
    if (!record) throw new WorkoutControllerError('no_workout', 'Create or open a workout first');
    return record;
  }

  private update(patch: Partial<WorkoutSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
