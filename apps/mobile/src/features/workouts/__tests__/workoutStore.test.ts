// RO-014 PR 4.2: the workout store over the app's real composition (WorkoutController, recording controller and the
// simulated device), driven by a test scheduler. Synthetic data only: nothing here measures real reps.
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createInMemoryRepositories, formatResistance } from '@repone/workout-domain';
import { assembleContainer } from '../../../application/createAppContainer';
import { createWorkoutStore } from '../workoutStore';

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 500 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 0));
  if (!condition()) throw new Error(`timed out waiting for ${what}`);
}

function setup() {
  const scheduler = new ManualScheduler();
  let now = 1_700_000_000_000;
  const container = assembleContainer(createInMemoryRepositories(), { now: () => (now += 1000) }, { scheduler, seed: 1 });
  return { scheduler, container, store: createWorkoutStore(container) };
}

describe('workoutStore', () => {
  it('runs a workout: exercise with machine, entered resistance, a recorded set, pause rules, finish', async () => {
    const { scheduler, store } = setup();
    const state = () => store.getState();
    const record = () => state().workout.record!;

    await state().load();
    expect(state().workout.record).toBeNull();
    expect(state().defaultUnit).toBe('kg');

    await state().newWorkout();
    await state().createAndAddExercise({ name: 'Row', machine: { name: 'Seated row', motionType: 'rotational' } });
    expect(state().exercises.map((e) => e.name)).toEqual(['Row']);
    const [entry] = record().exercises;
    expect(state().machines[entry!.machine_id!]).toMatchObject({ name: 'Seated row', motion_type: 'rotational' });

    await state().addSet(entry!.id);
    await state().addSet(entry!.id);
    const [set1, set2] = record().sets;
    await state().setResistance(set1!.id, 100, 'lb');
    expect(formatResistance(record().sets[0]!.resistance!)).toBe('100 lb');
    expect(state().defaultUnit).toBe('lb'); // the last unit used (decision 2)

    await state().start();
    await state().recordSet(set1!.id);
    expect(state().workout.recordingSetId).toBe(set1!.id);
    scheduler.advance(20_000);
    expect(state().live.status).toBe('recording');
    expect(state().live.fullReps + state().live.partialReps).toBeGreaterThan(0);

    // Pausing, finishing and recording another set are refused while set 1 records; the message is shown.
    await state().pause();
    expect(state().actionError).toMatch(/Stop the set that is recording/);
    await state().recordSet(set2!.id);
    expect(state().actionError).toMatch(/Stop the set that is recording/);
    expect(record().workout.status).toBe('active');

    await state().stopSet();
    await waitFor(() => state().workout.recordingSetId === null, 'the set to be saved');
    const result = state().workout.setResults.find((r) => r.set.id === set1!.id)!;
    expect(result.set.status).toBe('completed');
    expect(result.provenance).toBe('simulated');
    expect(result.full_rep_count + result.partial_rep_count).toBeGreaterThan(0);
    await waitFor(() => result.set.recording_session_id! in state().outcomes, 'the outcome');
    expect(state().outcomes[result.set.recording_session_id!]).toEqual({ end_reason: 'stopped', sensor_error_code: null });

    await state().pause();
    expect(state().actionError).toBeNull();
    expect(record().workout.status).toBe('paused');
    await state().resume();
    await state().finish();
    expect(record().workout.status).toBe('finished');

    // A finished workout is read-only.
    await state().addSet(entry!.id);
    expect(state().actionError).toMatch(/finished workout cannot be changed/);
  });

  it('prefills a new workout\'s set and shows "last time" from the earlier workout', async () => {
    const { scheduler, store } = setup();
    const state = () => store.getState();
    const record = () => state().workout.record!;
    await state().load();
    await state().newWorkout();
    await state().createAndAddExercise({ name: 'Row', machine: { name: 'Seated row', motionType: 'rotational' } });
    const [entry] = record().exercises;
    await state().addSet(entry!.id);
    await state().setResistance(record().sets[0]!.id, 100, 'lb');
    await state().start();
    await state().recordSet(record().sets[0]!.id);
    scheduler.advance(10_000);
    await state().stopSet();
    await waitFor(() => state().workout.recordingSetId === null, 'the set to be saved');
    await state().finish();

    await state().newWorkout();
    await state().addExercise(entry!.exercise_id, entry!.machine_id);
    const [next] = record().exercises;
    await state().addSet(next!.id);
    expect(formatResistance(record().sets[0]!.resistance!)).toBe('100 lb');
    await waitFor(() => state().lastTime[entry!.exercise_id] !== undefined, 'last time');
    expect(formatResistance(state().lastTime[entry!.exercise_id]!.resistance!)).toBe('100 lb');
  });

  it('reopens an unfinished workout on load', async () => {
    const { container } = setup();
    const first = createWorkoutStore(container);
    await first.getState().load();
    await first.getState().newWorkout();
    const id = first.getState().workout.record!.workout.id;

    // The app restarts: a new controller and store over the same storage.
    let now = 1_800_000_000_000;
    const restarted = createWorkoutStore(assembleContainer(container.repositories, { now: () => (now += 1000) }, { scheduler: new ManualScheduler(), seed: 2 }));
    await restarted.getState().load();
    expect(restarted.getState().workout.record?.workout.id).toBe(id);
  });

  it('turns a creation with an invalid name into a message, without adding anything', async () => {
    const { store } = setup();
    await store.getState().load();
    await store.getState().newWorkout();
    await store.getState().createAndAddExercise({ name: '   ', machine: null });
    expect(store.getState().actionError).toMatch(/name must be/);
    expect(store.getState().workout.record!.exercises).toEqual([]);
    store.getState().dismissError();
    expect(store.getState().actionError).toBeNull();
  });
});
