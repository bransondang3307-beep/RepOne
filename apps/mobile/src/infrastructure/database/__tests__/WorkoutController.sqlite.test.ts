// RO-014 PR 1: the WorkoutController through the real SQLite repositories (node:sqlite behind the same SqlDatabase port
// as expo-sqlite). Each test's setup, event order and expected persisted state is in
// docs/plans/RO-014-pr1-workout-controller.md §4a (T1–T4).
// Post-recording assertions wait for the WORKOUT-level `settled` promise that recordSet returns (plan §3a), never for
// the recording controller's own finished/error snapshot, which comes before the set is saved and the lock released.
// Every recording here is SYNTHETIC (simulated or replayed): nothing measures real reps.
import { RotationalRepDetector } from '@repone/rep-engine';
import {
  BaseSensorSource,
  DEMO_LOOP_SCRIPT,
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SimulatedSensorSource,
  createSyntheticCalibration,
  generateTrace,
  type RawSensorSample,
  type SensorSource,
  type SimulationOptions,
} from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { activeDurationMs, formatResistance, type Repositories, type WorkoutRecord } from '@repone/workout-domain';
import { WorkoutController } from '../../../application/services/WorkoutController';
import { WorkoutSessionController } from '../../../application/services/WorkoutSessionController';
import { createSqliteRepositories } from '../createSqliteRepositories';
import { migrate } from '../migrations';
import { openNodeSqliteDatabase } from './nodeSqliteDatabase';

const SIMULATION: SimulationOptions = { sourceId: 'sim-test-01', sampleRateHz: 50, seed: 42, gyroNoiseRadS: 0.02, accelNoiseMS2: 0.05 };
const calibration = createSyntheticCalibration(0);
const labelledTrace = () => generateTrace(LABELLED_SET_SCRIPT, SIMULATION, 'labelled set, low noise');
const replay = () => new ReplaySensorSource({ id: 'replay-row', samples: labelledTrace().samples, provenance: 'simulated' });

/** Lets queued promises and zero-delay timers run until `condition` holds. */
async function waitFor(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 500 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 0));
  if (!condition()) throw new Error(`timed out waiting for ${what}`);
}

/** A sensor whose start() stays pending until the test releases it (T3 a). */
class DeferredStartSensor extends BaseSensorSource {
  startCalled = false;
  private releaseStart: (() => void) | null = null;
  constructor() {
    super('deferred-01', 'simulated', 'simulated');
  }
  start(): Promise<void> {
    this.startCalled = true;
    return new Promise((resolve) => {
      this.releaseStart = () => {
        this.setStatus('streaming');
        resolve();
      };
    });
  }
  async stop(): Promise<void> {
    this.setStatus('stopped');
  }
  release(): void {
    this.releaseStart?.();
  }
}

/** A sensor whose start() delivers every sample and ends the stream, then waits for a gate (T4). */
class FinishesDuringStartSensor extends BaseSensorSource {
  private openGate: () => void = () => undefined;
  private readonly gate = new Promise<void>((resolve) => (this.openGate = resolve));
  constructor(private readonly samples: readonly RawSensorSample[]) {
    super('replay-gated', 'replay', 'simulated');
  }
  async start(): Promise<void> {
    this.setStatus('streaming');
    for (const sample of this.samples) this.emit(sample);
    this.setStatus('stopped');
    await this.gate;
  }
  async stop(): Promise<void> {
    this.setStatus('stopped');
  }
  release(): void {
    this.openGate();
  }
}

/** Shared setup (§4a): "Row" on "Seated row" (rotational), one set at 100 lb, workout started. */
async function setup(db: ReturnType<typeof openNodeSqliteDatabase>, wrap: (r: Repositories) => Repositories = (r) => r) {
  const repositories = wrap(createSqliteRepositories(db));
  let now = 1_700_000_000_000;
  const clock = { now: () => (now += 1000) };
  let recordings = 0;
  const recorder = new WorkoutSessionController({
    repositories,
    clock,
    createId: () => `session-${++recordings}`,
    createDetector: (sessionId, cal) => new RotationalRepDetector(sessionId, cal),
  });
  let nextSensor: () => SensorSource = replay;
  let ids = 0;
  const workouts = new WorkoutController({
    repositories,
    recorder,
    clock,
    createId: () => `id-${++ids}`,
    getSessionSensor: async () => nextSensor(),
    getCalibration: () => calibration,
  });
  const { exercise, machine } = await workouts.createExercise('Row', { name: 'Seated row', motion_type: 'rotational' });
  await workouts.create();
  const workoutExerciseId = await workouts.addExercise(exercise.id, machine!.id);
  const set1 = await workouts.addSet(workoutExerciseId);
  await workouts.setResistance(set1, 100, 'lb');
  await workouts.start();
  const workoutId = workouts.getSnapshot().record!.workout.id;
  const stored = async (): Promise<WorkoutRecord> => (await repositories.workouts.getById(workoutId))!;
  return {
    repositories,
    recorder,
    workouts,
    exercise,
    machine: machine!,
    workoutExerciseId,
    set1,
    workoutId,
    stored,
    now: () => now,
    useSensor: (factory: () => SensorSource) => (nextSensor = factory),
  };
}

describe('WorkoutController × SQLite (integration, RO-014 PR 1)', () => {
  let db: ReturnType<typeof openNodeSqliteDatabase>;

  beforeEach(async () => {
    db = openNodeSqliteDatabase();
    await migrate(db);
  });

  afterEach(() => db.close());

  it('T1 normal completion: links exactly one session, completes the set, and history shows 8 full / 2 partial, stream_ended, 100 lb', async () => {
    const t = await setup(db);
    const handle = await t.workouts.recordSet(t.set1);
    const settled = await handle.settled;

    expect(settled.set).toMatchObject({ id: t.set1, status: 'completed', recording_session_id: handle.sessionId });
    expect(settled.result).toMatchObject({ full_rep_count: 8, partial_rep_count: 2, provenance: 'simulated' });
    expect(settled.outcome).toEqual({ end_reason: 'stream_ended', sensor_error_code: null });
    expect(settled.error).toBeNull();
    expect(t.workouts.getSnapshot().recordingSetId).toBeNull();

    await t.workouts.finish();
    const stored = await t.stored();
    expect(stored.workout.status).toBe('finished');
    const set = stored.sets.find((s) => s.id === t.set1)!;
    expect(set).toMatchObject({ status: 'completed', recording_session_id: handle.sessionId });
    expect(set.resistance).toMatchObject({ entered_unit: 'lb', source: 'user_entered' });
    expect(formatResistance(set.resistance!)).toBe('100 lb');
    expect(stored.sets.filter((s) => s.recording_session_id === handle.sessionId)).toHaveLength(1);

    const recordings = await t.repositories.sessions.listRecent(10);
    expect(recordings.map((r) => r.id)).toEqual([handle.sessionId]);
    expect(recordings[0]).toMatchObject({ machine_label: 'Row · Seated row', provenance: 'simulated', full_rep_count: 8, partial_rep_count: 2 });

    const [summary] = await t.repositories.workouts.listRecent(1);
    expect(summary).toMatchObject({ completed_set_count: 1, full_rep_count: 8, partial_rep_count: 2 });
    const [last] = await t.repositories.workouts.listExerciseHistory(t.exercise.id, 1);
    expect(formatResistance(last!.resistance!)).toBe('100 lb');

    // A new workout's set of the same exercise is prefilled with the last resistance, and the unit is remembered.
    await t.workouts.create();
    const nextExercise = await t.workouts.addExercise(t.exercise.id, t.machine.id);
    const nextSet = await t.workouts.addSet(nextExercise);
    expect(t.workouts.getSnapshot().record!.sets.find((s) => s.id === nextSet)!.resistance).toEqual(set.resistance);
    expect(await t.workouts.defaultResistanceUnit()).toBe('lb');
  });

  it('T2 sensor failure: the set completes with sensor_error / connection_lost and the reps saved before the failure; the workout stays active', async () => {
    // Fail 50 samples after the detector's first rep on this trace, so at least one rep is saved first.
    const detector = new RotationalRepDetector('probe', calibration);
    const firstRep = labelledTrace().samples.findIndex((sample) => detector.push(sample).length > 0);
    expect(firstRep).toBeGreaterThan(0);
    const afterSamples = firstRep + 50;
    const scheduler = new ManualScheduler();
    const t = await setup(db);
    t.useSensor(
      () => new SimulatedSensorSource({ script: LABELLED_SET_SCRIPT, simulation: SIMULATION, scheduler, fault: { afterSamples, code: 'connection_lost' } }),
    );

    const handle = await t.workouts.recordSet(t.set1);
    scheduler.advance(120_000);
    const settled = await handle.settled;

    expect(settled.set).toMatchObject({ id: t.set1, status: 'completed', recording_session_id: handle.sessionId });
    expect(settled.outcome).toEqual({ end_reason: 'sensor_error', sensor_error_code: 'connection_lost' });
    expect(settled.error).toMatch(/connection was lost.*samples received before the failure were saved/);
    const events = await t.repositories.repEvents.listBySession(handle.sessionId);
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThan(10);
    expect(settled.result.full_rep_count + settled.result.partial_rep_count).toBe(events.length);
    expect(await t.repositories.rawSamples.listBySession(handle.sessionId)).toHaveLength(afterSamples);

    const stored = await t.stored();
    expect(stored.workout).toMatchObject({ status: 'active', pauses: [] });

    // Re-recording means adding a set (decision 1).
    t.useSensor(replay);
    const set2 = await t.workouts.addSet(t.workoutExerciseId);
    await (await t.workouts.recordSet(set2)).settled;
    const after = await t.stored();
    expect(after.sets.map((s) => s.status)).toEqual(['completed', 'completed']);
    expect(new Set(after.sets.map((s) => s.recording_session_id)).size).toBe(2);
    expect(await t.repositories.sessions.listRecent(10)).toHaveLength(2);
  });

  describe('T3 pause during a recording is refused and leaves the workout and recording consistent', () => {
    async function pauseAndResumeAfterTheSet(t: Awaited<ReturnType<typeof setup>>) {
      await t.workouts.pause();
      const paused = await t.stored();
      expect(paused.workout.status).toBe('paused');
      expect(paused.workout.pauses).toHaveLength(1);
      expect(paused.workout.pauses[0]!.end_epoch_ms).toBeNull();

      await t.workouts.resume();
      const resumed = await t.stored();
      expect(resumed.workout.status).toBe('active');
      const [pause] = resumed.workout.pauses;
      expect(pause!.end_epoch_ms).not.toBeNull();
      const at = t.now() + 5000;
      expect(activeDurationMs(resumed.workout, at)).toBe(at - resumed.workout.started_at_epoch_ms! - (pause!.end_epoch_ms! - pause!.start_epoch_ms));
    }

    it('(a) before the link, while start() is still pending', async () => {
      const sensor = new DeferredStartSensor();
      const t = await setup(db);
      t.useSensor(() => sensor);

      const recording = t.workouts.recordSet(t.set1);
      await waitFor(() => sensor.startCalled, 'the sensor start');
      // These must reject while start() is pending: a queue held by start() would hang here, not pass.
      await expect(t.workouts.pause()).rejects.toMatchObject({ name: 'WorkoutRuleError', code: 'set_recording' });
      await expect(t.workouts.finish()).rejects.toMatchObject({ name: 'WorkoutRuleError', code: 'set_recording' });
      const during = await t.stored();
      expect(during.workout).toMatchObject({ status: 'active', pauses: [] });
      expect(during.sets.find((s) => s.id === t.set1)!.status).toBe('planned');

      sensor.release();
      const handle = await recording;
      expect((await t.stored()).sets.find((s) => s.id === t.set1)).toMatchObject({ status: 'recording', recording_session_id: handle.sessionId });
      await t.workouts.stopSet();
      const settled = await handle.settled;
      expect(settled.set.status).toBe('completed');
      expect(settled.outcome).toEqual({ end_reason: 'stopped', sensor_error_code: null });

      await pauseAndResumeAfterTheSet(t);
    });

    it('(b) while recording, after the link', async () => {
      const scheduler = new ManualScheduler();
      const t = await setup(db);
      t.useSensor(() => new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: SIMULATION, scheduler }));

      const handle = await t.workouts.recordSet(t.set1);
      scheduler.advance(2000);
      await expect(t.workouts.pause()).rejects.toMatchObject({ name: 'WorkoutRuleError', code: 'set_recording' });
      const during = await t.stored();
      expect(during.workout).toMatchObject({ status: 'active', pauses: [] });
      expect(during.sets.find((s) => s.id === t.set1)).toMatchObject({ status: 'recording', recording_session_id: handle.sessionId });

      // The refused pause did not stop the recording.
      const before = t.recorder.getSnapshot().samplesReceived;
      scheduler.advance(2000);
      expect(t.recorder.getSnapshot().status).toBe('recording');
      expect(t.recorder.getSnapshot().samplesReceived).toBeGreaterThan(before);

      await t.workouts.stopSet();
      const settled = await handle.settled;
      expect(settled.set.status).toBe('completed');

      await pauseAndResumeAfterTheSet(t);
    });
  });

  it('T4 a recording that finishes before start() resolves is finalized once, after its set is linked; history is read after settled', async () => {
    const saved: string[] = [];
    let set1 = '';
    const t = await setup(db, (r) => ({
      ...r,
      workouts: {
        ...r.workouts,
        save: async (record: WorkoutRecord) => {
          await r.workouts.save(record);
          saved.push(record.sets.find((s) => s.id === set1)?.status ?? '-');
        },
      },
    }));
    set1 = t.set1;
    const sensor = new FinishesDuringStartSensor(labelledTrace().samples);
    t.useSensor(() => sensor);
    saved.length = 0;

    const recording = t.workouts.recordSet(t.set1);
    // The recording controller publishes `finished` while start() is still pending: buffered, not processed.
    await waitFor(() => t.recorder.getSnapshot().status === 'finished', 'the recording to finish');
    expect(t.workouts.getSnapshot().recordingSetId).toBe(t.set1);
    expect((await t.stored()).sets.find((s) => s.id === t.set1)!.status).toBe('planned');
    expect(saved).toEqual([]);

    sensor.release();
    const handle = await recording;
    const settled = await handle.settled;

    // Linked, then completed exactly once: no `set_not_recording`, nothing dropped.
    expect(saved).toEqual(['recording', 'completed']);
    expect(settled.result).toMatchObject({ full_rep_count: 8, partial_rep_count: 2, provenance: 'simulated' });
    expect(await t.repositories.sessions.getOutcome(handle.sessionId)).toEqual({ end_reason: 'stream_ended', sensor_error_code: null });
    expect(t.workouts.getSnapshot().recordingSetId).toBeNull();
  });
});
