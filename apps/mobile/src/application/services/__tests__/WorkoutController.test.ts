// RO-014 PR 1: WorkoutController unit tests on the in-memory repositories (docs/plans/RO-014-pr1-workout-controller.md
// §3, §3a, §3b and the unit-test list in §4a). SYNTHETIC sensors only.
import { RotationalRepDetector } from '@repone/rep-engine';
import {
  BaseSensorSource,
  DEMO_LOOP_SCRIPT,
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SimulatedSensorSource,
  createSyntheticCalibration,
  generateTrace,
  type SensorError,
  type SensorSource,
  type SimulationOptions,
  type Unsubscribe,
} from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createInMemoryRepositories, type Repositories, type WorkoutRecord } from '@repone/workout-domain';
import { WorkoutController, type SetRecorder } from '../WorkoutController';
import { WorkoutSessionController, type SessionSnapshot, type StartSessionParams } from '../WorkoutSessionController';

const SIMULATION: SimulationOptions = { sourceId: 'sim-test-01', sampleRateHz: 50, seed: 42, gyroNoiseRadS: 0.02 };
const calibration = createSyntheticCalibration(0);
const replay = () => new ReplaySensorSource({ id: 'replay-1', samples: generateTrace(LABELLED_SET_SCRIPT, SIMULATION).samples, provenance: 'simulated' });

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 500 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 0));
  if (!condition()) throw new Error(`timed out waiting for ${what}`);
}

/** Settles `promise` into a value we can inspect without awaiting it to completion first. */
function track<T>(promise: Promise<T>) {
  const state: { done: boolean; value?: T; error?: unknown } = { done: false };
  promise.then(
    (value) => Object.assign(state, { done: true, value }),
    (error: unknown) => Object.assign(state, { done: true, error }),
  );
  return state;
}

class DeferredStartSensor extends BaseSensorSource {
  startCalled = false;
  private settle: { resolve: () => void; reject: (error: unknown) => void } | null = null;
  constructor() {
    super('deferred-01', 'simulated', 'simulated');
  }
  start(): Promise<void> {
    this.startCalled = true;
    return new Promise((resolve, reject) => {
      this.settle = {
        resolve: () => {
          this.setStatus('streaming');
          resolve();
        },
        reject,
      };
    });
  }
  async stop(): Promise<void> {
    this.setStatus('stopped');
  }
  release(): void {
    this.settle?.resolve();
  }
  rejectStart(error: SensorError): void {
    this.fail(error);
    this.settle?.reject(Object.assign(new Error(error.message), { sensorError: error }));
  }
}

/** Saves through to the in-memory store, except when `failWhen` says to throw; counts what was saved. */
function savingSpy(base: Repositories) {
  const saves: WorkoutRecord[] = [];
  let failWhen: ((record: WorkoutRecord) => boolean) | null = null;
  const repositories: Repositories = {
    ...base,
    workouts: {
      ...base.workouts,
      save: async (record) => {
        if (failWhen?.(record)) throw new Error('disk full (simulated)');
        await base.workouts.save(record);
        saves.push(record);
      },
    },
  };
  return { repositories, saves, failWhen: (predicate: ((record: WorkoutRecord) => boolean) | null) => (failWhen = predicate) };
}

async function setup(options: { recorder?: (repositories: Repositories) => SetRecorder } = {}) {
  const spy = savingSpy(createInMemoryRepositories());
  const { repositories } = spy;
  let now = 1_700_000_000_000;
  const clock = { now: () => (now += 1000) };
  let recordings = 0;
  const recorder =
    options.recorder?.(repositories) ??
    new WorkoutSessionController({
      repositories,
      clock,
      createId: () => `session-${++recordings}`,
      createDetector: (sessionId, cal) => new RotationalRepDetector(sessionId, cal),
    });
  let nextSensor: () => Promise<SensorSource> = async () => replay();
  let ids = 0;
  const workouts = new WorkoutController({
    repositories,
    recorder,
    clock,
    createId: () => `id-${++ids}`,
    getSessionSensor: () => nextSensor(),
    getCalibration: () => calibration,
  });
  const { exercise, machine } = await workouts.createExercise('Row', { name: 'Seated row', motion_type: 'rotational' });
  await workouts.create();
  const workoutExerciseId = await workouts.addExercise(exercise.id, machine!.id);
  const set1 = await workouts.addSet(workoutExerciseId);
  const set2 = await workouts.addSet(workoutExerciseId);
  await workouts.start();
  const workoutId = workouts.getSnapshot().record!.workout.id;
  return {
    ...spy,
    recorder,
    workouts,
    workoutExerciseId,
    set1,
    set2,
    stored: async () => (await repositories.workouts.getById(workoutId))!,
    useSensor: (factory: () => SensorSource | Promise<SensorSource>) => (nextSensor = async () => factory()),
  };
}

/** The set's status in a record; undefined in records saved before the set was added. */
const statusOf = (record: WorkoutRecord, setId: string) => record.sets.find((s) => s.id === setId)?.status;

describe('WorkoutController', () => {
  it('a quick set stays standalone, and recordSet refuses while one runs', async () => {
    const t = await setup();
    const recorder = t.recorder as WorkoutSessionController;
    const scheduler = new ManualScheduler();
    const quickSet = await recorder.start({ sensor: new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: SIMULATION, scheduler }), calibration });
    scheduler.advance(1000);

    await expect(t.workouts.recordSet(t.set1)).rejects.toMatchObject({ name: 'WorkoutControllerError', code: 'recorder_busy' });
    expect(t.workouts.getSnapshot().recordingSetId).toBeNull();

    await recorder.stop();
    const stored = await t.stored();
    expect(stored.sets.every((s) => s.recording_session_id === null && s.status === 'planned')).toBe(true);
    expect((await t.repositories.sessions.listRecent(5)).map((s) => s.id)).toEqual([quickSet]);

    // Once the quick set is over, the workout's set records normally.
    recorder.reset();
    expect((await (await t.workouts.recordSet(t.set1)).settled).set.status).toBe('completed');
  });

  it('a quick set started while the set\'s sensor is being prepared is never taken for the set\'s recording', async () => {
    const t = await setup();
    const recorder = t.recorder as WorkoutSessionController;
    const scheduler = new ManualScheduler();
    let quickSet = '';
    t.useSensor(async () => {
      // The user starts a quick set in the moment between the lock and the set's own start().
      quickSet = await recorder.start({ sensor: new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: SIMULATION, scheduler }), calibration });
      return replay();
    });
    await expect(t.workouts.recordSet(t.set1)).rejects.toThrow('A session is already in progress');
    const stored = await t.stored();
    expect(stored.sets.find((s) => s.id === t.set1)).toMatchObject({ status: 'planned', recording_session_id: null });
    expect(t.workouts.getSnapshot().recordingSetId).toBeNull();
    expect(recorder.getSnapshot()).toMatchObject({ status: 'recording', sessionId: quickSet });
    await recorder.stop();
  });

  describe('start failures (plan §3 step 6)', () => {
    it('after the recording was created: the set completes with start_failed and no reps; the lock is released', async () => {
      const t = await setup();
      const sensor = new DeferredStartSensor();
      t.useSensor(() => sensor);
      const recording = t.workouts.recordSet(t.set1);
      await waitFor(() => sensor.startCalled, 'the sensor start');
      sensor.rejectStart({ code: 'start_failed', message: 'no response from the device' });

      const handle = await recording;
      const settled = await handle.settled;
      expect(settled.set).toMatchObject({ id: t.set1, status: 'completed', recording_session_id: handle.sessionId });
      expect(settled.outcome).toEqual({ end_reason: 'start_failed', sensor_error_code: 'start_failed' });
      expect(settled.result).toMatchObject({ full_rep_count: 0, partial_rep_count: 0 });
      expect(settled.error).toMatch(/could not start/);
      expect(t.workouts.getSnapshot().recordingSetId).toBeNull();
      await t.workouts.pause();
      expect((await t.stored()).workout.status).toBe('paused');
    });

    it('before a recording exists: the set stays planned, recordSet rejects, and the lock is released', async () => {
      const t = await setup();
      t.useSensor(() => Promise.reject(new Error('Bluetooth is off')));
      await expect(t.workouts.recordSet(t.set1)).rejects.toThrow('Bluetooth is off');

      expect(t.workouts.getSnapshot()).toMatchObject({ recordingSetId: null, error: 'Bluetooth is off' });
      expect(statusOf(await t.stored(), t.set1)).toBe('planned');
      expect(await t.repositories.sessions.listRecent(5)).toEqual([]);
      await t.workouts.pause();
      expect((await t.stored()).workout.status).toBe('paused');
    });
  });

  describe('repeated actions and refusals leave the stored record unchanged (plan §3b)', () => {
    async function expectRefusedWithoutSaving(t: Awaited<ReturnType<typeof setup>>, action: () => Promise<unknown>, expected: object) {
      const before = await t.stored();
      const saves = t.saves.length;
      await expect(action()).rejects.toMatchObject(expected);
      expect(t.saves.length).toBe(saves);
      expect(await t.stored()).toEqual(before);
      expect(t.workouts.getSnapshot().record).toEqual(before);
    }

    it('start, pause, resume and finish twice', async () => {
      const t = await setup();
      await expectRefusedWithoutSaving(t, () => t.workouts.start(), { name: 'WorkoutTransitionError' });
      await expectRefusedWithoutSaving(t, () => t.workouts.resume(), { name: 'WorkoutTransitionError' });
      await t.workouts.pause();
      await expectRefusedWithoutSaving(t, () => t.workouts.pause(), { name: 'WorkoutTransitionError' });
      await expectRefusedWithoutSaving(t, () => t.workouts.recordSet(t.set1), { name: 'WorkoutRuleError', code: 'not_active' });
      await t.workouts.resume();
      await t.workouts.finish();
      await expectRefusedWithoutSaving(t, () => t.workouts.finish(), { name: 'WorkoutTransitionError' });
      await expectRefusedWithoutSaving(t, () => t.workouts.addSet(t.workoutExerciseId), { name: 'WorkoutRuleError', code: 'finished_read_only' });
    });

    it('recordSet on the set already recording, or any recordSet while the lock is held; then on a completed set', async () => {
      const t = await setup();
      const scheduler = new ManualScheduler();
      t.useSensor(() => new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: SIMULATION, scheduler }));
      const handle = await t.workouts.recordSet(t.set1);
      await expectRefusedWithoutSaving(t, () => t.workouts.recordSet(t.set1), { name: 'WorkoutRuleError', code: 'set_recording' });
      await expectRefusedWithoutSaving(t, () => t.workouts.recordSet(t.set2), { name: 'WorkoutRuleError', code: 'set_recording' });
      await expectRefusedWithoutSaving(t, () => t.workouts.create(), { name: 'WorkoutRuleError', code: 'set_recording' });

      await t.workouts.stopSet();
      await t.workouts.stopSet(); // idempotent
      await handle.settled;
      await expectRefusedWithoutSaving(t, () => t.workouts.recordSet(t.set1), { name: 'WorkoutRuleError', code: 'set_not_planned' });
      const saves = t.saves.length;
      await t.workouts.stopSet(); // no attempt: a no-op
      expect(t.saves.length).toBe(saves);
    });

    it('an invalid resistance is refused before anything is saved', async () => {
      const t = await setup();
      await expectRefusedWithoutSaving(t, () => t.workouts.setResistance(t.set1, -5, 'kg'), { name: 'ResistanceError' });
    });
  });

  describe('queue and lock order (plan §3b)', () => {
    it('while start() is pending: pause, finish and another recordSet reject at once; other changes complete', async () => {
      const t = await setup();
      const sensor = new DeferredStartSensor();
      t.useSensor(() => sensor);
      const recording = t.workouts.recordSet(t.set1);
      await waitFor(() => sensor.startCalled, 'the sensor start');

      const refused = [track<unknown>(t.workouts.pause()), track<unknown>(t.workouts.finish()), track<unknown>(t.workouts.recordSet(t.set2))];
      await waitFor(() => refused.every((r) => r.done), 'the refusals');
      for (const r of refused) expect(r.error).toMatchObject({ name: 'WorkoutRuleError', code: 'set_recording' });

      // A change that does not touch the recording set goes through while the start is pending.
      const set3 = await t.workouts.addSet(t.workoutExerciseId);
      await t.workouts.setResistance(t.set2, 40, 'kg');
      const during = await t.stored();
      expect(during.sets.map((s) => s.id)).toContain(set3);
      expect(during.sets.find((s) => s.id === t.set2)!.resistance).toMatchObject({ kg: 40, entered_unit: 'kg' });
      expect(statusOf(during, t.set1)).toBe('planned');
      expect(sensor.startCalled).toBe(true);

      sensor.release();
      const handle = await recording;
      await t.workouts.stopSet();
      await handle.settled;
      expect(statusOf(await t.stored(), t.set1)).toBe('completed');
    });

    it('recordSet then pause, without awaiting: the pause is refused', async () => {
      const t = await setup();
      const recording = t.workouts.recordSet(t.set1);
      await expect(t.workouts.pause()).rejects.toMatchObject({ code: 'set_recording' });
      await (await recording).settled;
      expect((await t.stored()).workout.pauses).toEqual([]);
    });

    it('pause then recordSet, without awaiting: the pause is saved and the domain refuses the recording', async () => {
      const t = await setup();
      const pausing = t.workouts.pause();
      await expect(t.workouts.recordSet(t.set1)).rejects.toMatchObject({ name: 'WorkoutRuleError', code: 'not_active' });
      await pausing;
      const stored = await t.stored();
      expect(stored.workout.status).toBe('paused');
      expect(statusOf(stored, t.set1)).toBe('planned');
      expect(t.workouts.getSnapshot().recordingSetId).toBeNull();
    });
  });

  describe('save failures (plan §3b)', () => {
    it('a failed link save keeps the recording running; the set is linked and completed in one save at the end', async () => {
      const t = await setup();
      const scheduler = new ManualScheduler();
      t.useSensor(() => new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: SIMULATION, scheduler }));
      t.failWhen((record) => statusOf(record, t.set1) === 'recording');

      const handle = await t.workouts.recordSet(t.set1);
      expect(t.workouts.getSnapshot().error).toMatch(/could not be saved yet/);
      expect(statusOf(await t.stored(), t.set1)).toBe('planned');
      expect(statusOf(t.workouts.getSnapshot().record!, t.set1)).toBe('planned'); // memory follows only saved changes
      scheduler.advance(3000);
      expect((t.recorder as WorkoutSessionController).getSnapshot().status).toBe('recording');

      t.failWhen(null);
      const saves = t.saves.length;
      await t.workouts.stopSet();
      const settled = await handle.settled;
      expect(t.saves.length).toBe(saves + 1);
      expect(t.saves.at(-1)!.sets.find((s) => s.id === t.set1)).toMatchObject({ status: 'completed', recording_session_id: handle.sessionId });
      expect(settled.set.status).toBe('completed');
    });

    it('a failed completion save rejects settled and keeps the lock; retryPendingSave completes the set exactly once', async () => {
      const t = await setup();
      t.failWhen((record) => statusOf(record, t.set1) === 'completed');
      const handle = await t.workouts.recordSet(t.set1);
      await expect(handle.settled).rejects.toThrow('disk full');

      expect(t.workouts.getSnapshot()).toMatchObject({ recordingSetId: t.set1, pendingSave: true });
      expect(statusOf(await t.stored(), t.set1)).toBe('recording');
      // Still locked: the workout cannot pause around an unsaved set. The pause first retries the save, which fails.
      await expect(t.workouts.pause()).rejects.toThrow('disk full');
      expect((await t.stored()).workout).toMatchObject({ status: 'active', pauses: [] });

      t.failWhen(null);
      const saved = await t.workouts.retryPendingSave();
      expect(saved).toMatchObject({ set: { id: t.set1, status: 'completed' }, outcome: { end_reason: 'stream_ended' } });
      expect(t.saves.filter((r) => statusOf(r, t.set1) === 'completed')).toHaveLength(1);
      expect(t.workouts.getSnapshot()).toMatchObject({ recordingSetId: null, pendingSave: false });
      expect(await t.workouts.retryPendingSave()).toBeNull();
      await t.workouts.pause();
      expect((await t.stored()).workout.status).toBe('paused');
    });

    it('the next change saves a pending completed set first', async () => {
      const t = await setup();
      t.failWhen((record) => statusOf(record, t.set1) === 'completed');
      const handle = await t.workouts.recordSet(t.set1);
      await expect(handle.settled).rejects.toThrow('disk full');
      t.failWhen(null);

      await t.workouts.pause();
      const stored = await t.stored();
      expect(statusOf(stored, t.set1)).toBe('completed');
      expect(stored.workout.status).toBe('paused');
      expect(t.workouts.getSnapshot().recordingSetId).toBeNull();
    });
  });

  describe('stale recording events (plan §3b)', () => {
    /** Publishes the recording controller's snapshots in an order the test chooses. */
    class ScriptedRecorder implements SetRecorder {
      private snapshot: SessionSnapshot = {
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
      private readonly listeners = new Set<(s: SessionSnapshot) => void>();
      private finishStart: { resolve: () => void; reject: (error: unknown) => void } | null = null;
      constructor(private readonly repositories: Repositories) {}
      getSnapshot = () => this.snapshot;
      isBusy = () => ['starting', 'recording', 'stopping'].includes(this.snapshot.status);
      subscribe(listener: (s: SessionSnapshot) => void): Unsubscribe {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
      async stop(): Promise<void> {}
      start(params: StartSessionParams): Promise<string> {
        const id = 'rec-1';
        this.publish({ status: 'starting', sessionId: id, provenance: params.sensor.provenance });
        return (async () => {
          await this.repositories.sessions.create({
            id,
            activity_type: 'gym',
            provenance: params.sensor.provenance,
            source_id: params.sensor.id,
            source_kind: params.sensor.kind,
            calibration_id: params.calibration.calibration_id,
            algorithm_version: 'test',
            machine_label: params.machineLabel ?? null,
            started_at_epoch_ms: 1,
            ended_at_epoch_ms: null,
          });
          this.publish({ status: 'recording' });
          await new Promise<void>((resolve, reject) => (this.finishStart = { resolve, reject }));
          return id;
        })();
      }
      publish(patch: Partial<SessionSnapshot>): void {
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners) listener(this.snapshot);
      }
      resolveStart = () => this.finishStart?.resolve();
      rejectStart = (error: Error) => this.finishStart?.reject(error);
      get started() {
        return this.finishStart !== null;
      }
    }

    it('a terminal snapshot of another recording is ignored', async () => {
      let recorder!: ScriptedRecorder;
      const t = await setup({ recorder: (r) => (recorder = new ScriptedRecorder(r)) });
      const recording = t.workouts.recordSet(t.set1);
      await waitFor(() => recorder.started, 'the recording to start');
      recorder.resolveStart();
      const handle = await recording;
      const settled = track(handle.settled);

      recorder.publish({ status: 'finished', sessionId: 'quick-set-9' });
      recorder.publish({ status: 'error', sessionId: 'earlier-attempt', error: 'old failure' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(settled.done).toBe(false);
      expect(t.workouts.getSnapshot().recordingSetId).toBe(t.set1);
      expect(statusOf(await t.stored(), t.set1)).toBe('recording');

      recorder.publish({ status: 'finished', sessionId: 'rec-1', error: null });
      await waitFor(() => settled.done, 'the set to settle');
      expect(settled.value).toMatchObject({ set: { status: 'completed', recording_session_id: 'rec-1' }, error: null });
    });

    it('a second terminal snapshot for the same recording (a late start failure) completes the set once, with the final outcome', async () => {
      let recorder!: ScriptedRecorder;
      const t = await setup({ recorder: (r) => (recorder = new ScriptedRecorder(r)) });
      const recording = t.workouts.recordSet(t.set1);
      await waitFor(() => recorder.started, 'the recording to start');

      // `stopped` first, then the start failure replaces it, then start() rejects: completion waits for start().
      recorder.publish({ status: 'finished', sessionId: 'rec-1' });
      recorder.publish({ status: 'error', sessionId: 'rec-1', error: 'The sensor could not start (timeout).' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(statusOf(await t.stored(), t.set1)).toBe('planned');
      recorder.rejectStart(new Error('timeout'));

      const handle = await recording;
      const settled = await handle.settled;
      expect(settled.error).toBe('The sensor could not start (timeout).');
      expect(t.saves.filter((r) => statusOf(r, t.set1) === 'completed')).toHaveLength(1);
      recorder.publish({ status: 'error', sessionId: 'rec-1', error: 'even later' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(t.saves.filter((r) => statusOf(r, t.set1) === 'completed')).toHaveLength(1);
    });
  });

  it('load completes a set left recording by an interrupted app, keeping what it saved', async () => {
    const t = await setup();
    const scheduler = new ManualScheduler();
    t.useSensor(() => new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: SIMULATION, scheduler }));
    const handle = await t.workouts.recordSet(t.set1);
    scheduler.advance(2000);
    const workoutId = t.workouts.getSnapshot().record!.workout.id;

    // A second controller over the same storage stands in for the app after a restart.
    const restarted = new WorkoutController({
      repositories: t.repositories,
      recorder: new WorkoutSessionController({
        repositories: t.repositories,
        clock: { now: () => 1_800_000_000_000 },
        createId: () => 'session-after-restart',
        createDetector: (id, cal) => new RotationalRepDetector(id, cal),
      }),
      clock: { now: () => 1_800_000_000_000 },
      createId: () => 'unused',
      getSessionSensor: async () => replay(),
      getCalibration: () => calibration,
    });
    const loaded = await restarted.load(workoutId);
    expect(statusOf(loaded!, t.set1)).toBe('completed');
    expect(restarted.getSnapshot().error).toMatch(/interrupted/);
    expect(statusOf(await t.stored(), t.set1)).toBe('completed');
    await restarted.pause();
    expect((await t.stored()).workout.status).toBe('paused');

    await t.workouts.stopSet();
    await handle.settled.catch(() => undefined);
  });
});
