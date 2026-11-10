import type {
  Exercise,
  ExerciseHistoryEntry,
  Machine,
  MassUnit,
  MotionType,
  SessionOutcome,
} from '@repone/workout-domain';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppContainer, SessionSnapshot, WorkoutSnapshot } from '../../application';

export interface NewExerciseInput {
  readonly name: string;
  /** Optional machine, created with the exercise and linked to it. */
  readonly machine: { readonly name: string; readonly motionType: MotionType } | null;
}

export interface WorkoutState {
  /** The workout controller's snapshot: the current workout, the recording lock, set results. */
  readonly workout: WorkoutSnapshot;
  /** The recording controller's live snapshot, whatever it records (a workout set or a quick set). */
  readonly live: SessionSnapshot;
  /**
   * The last snapshot of the recording set's own recording (Codex P1 on PR #46). It is matched by session id, so a
   * quick set started while the set's save is pending never shows as the set's counts. Null when no set records.
   */
  readonly recordingLive: SessionSnapshot | null;
  /** Exercise catalog, alphabetical. */
  readonly exercises: readonly Exercise[];
  /** Every machine, by id: for names and motion types. */
  readonly machines: Readonly<Record<string, Machine>>;
  /** The most recent recorded set of each exercise in an earlier workout ("last time"), by exercise id. */
  readonly lastTime: Readonly<Record<string, ExerciseHistoryEntry | null>>;
  /** How each completed set's recording ended, by recording id (decision 1: an error is shown with the saved reps). */
  readonly outcomes: Readonly<Record<string, SessionOutcome | null>>;
  /** The unit new resistance is entered in: the last one used (decision 2). */
  readonly defaultUnit: MassUnit;
  /** The last action the controller or domain refused, as its message. */
  readonly actionError: string | null;
  /** Loads the catalog and reopens an unfinished workout. Safe to call again. */
  load(): Promise<void>;
  newWorkout(): Promise<void>;
  /** Create a catalog exercise (optionally with a machine) and add it to the workout. */
  createAndAddExercise(input: NewExerciseInput): Promise<void>;
  addExercise(exerciseId: string, machineId: string | null): Promise<void>;
  machinesFor(exerciseId: string): Promise<Machine[]>;
  addSet(workoutExerciseId: string): Promise<void>;
  setResistance(setId: string, value: number | null, unit: MassUnit): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  finish(): Promise<void>;
  recordSet(setId: string): Promise<void>;
  stopSet(): Promise<void>;
  retrySave(): Promise<void>;
  dismissError(): void;
}

export type WorkoutStore = StoreApi<WorkoutState>;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Thin UI-state adapter over the workout controller (application service). The rules live in the domain and the
 * controller; this store mirrors snapshots, keeps the names the screens show, and turns refusals into a message.
 */
export function createWorkoutStore(container: Pick<AppContainer, 'workouts' | 'repositories' | 'controller'>): WorkoutStore {
  const { workouts, repositories, controller } = container;

  /** Runs an action; a refusal is shown to the user rather than thrown at the screen. */
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    store.setState({ actionError: null });
    try {
      await action();
    } catch (error) {
      store.setState({ actionError: messageOf(error) });
    }
  };

  const loadCatalog = async () => {
    const [exercises, machineList] = await Promise.all([workouts.listExercises(), repositories.machines.list()]);
    store.setState({ exercises, machines: Object.fromEntries(machineList.map((m) => [m.id, m])) });
  };

  /** "Last time" for each exercise of the current workout, from earlier workouts only. */
  const loadLastTime = async () => {
    const record = store.getState().workout.record;
    if (!record) return;
    const known = store.getState().lastTime;
    const missing = [...new Set(record.exercises.map((e) => e.exercise_id))].filter((id) => !(id in known));
    if (missing.length === 0) return;
    const entries = await Promise.all(
      missing.map(async (exerciseId) => {
        const history = await repositories.workouts.listExerciseHistory(exerciseId, 20);
        return [exerciseId, history.find((h) => h.workout_id !== record.workout.id) ?? null] as const;
      }),
    );
    store.setState({ lastTime: { ...store.getState().lastTime, ...Object.fromEntries(entries) } });
  };

  /** The stored outcome of each completed set's recording that is not known yet. */
  const loadOutcomes = async () => {
    const known = store.getState().outcomes;
    const ids = store
      .getState()
      .workout.setResults.filter((r) => r.set.status === 'completed' && r.set.recording_session_id !== null)
      .map((r) => r.set.recording_session_id!)
      .filter((id) => !(id in known));
    if (ids.length === 0) return;
    const entries = await Promise.all(ids.map(async (id) => [id, await repositories.sessions.getOutcome(id)] as const));
    store.setState({ outcomes: { ...store.getState().outcomes, ...Object.fromEntries(entries) } });
  };

  const store = createStore<WorkoutState>()(() => ({
    workout: workouts.getSnapshot(),
    live: controller.getSnapshot(),
    recordingLive: null,
    exercises: [],
    machines: {},
    lastTime: {},
    outcomes: {},
    defaultUnit: 'kg',
    actionError: null,

    load: () =>
      run(async () => {
        await loadCatalog();
        store.setState({ defaultUnit: await workouts.defaultResistanceUnit() });
        if (!workouts.getSnapshot().record) await workouts.resumeLatest();
      }),

    newWorkout: () =>
      run(async () => {
        await workouts.create();
        store.setState({ lastTime: {}, defaultUnit: await workouts.defaultResistanceUnit() });
      }),

    createAndAddExercise: ({ name, machine }) =>
      run(async () => {
        const created = await workouts.createExercise(
          name,
          machine && machine.name.trim() !== '' ? { name: machine.name, motion_type: machine.motionType } : undefined,
        );
        await loadCatalog();
        await workouts.addExercise(created.exercise.id, created.machine?.id ?? null);
      }),

    addExercise: (exerciseId, machineId) => run(() => workouts.addExercise(exerciseId, machineId)),

    machinesFor: (exerciseId) => workouts.machinesFor(exerciseId),

    addSet: (workoutExerciseId) => run(() => workouts.addSet(workoutExerciseId)),

    setResistance: (setId, value, unit) =>
      run(async () => {
        await workouts.setResistance(setId, value, unit);
        if (value !== null) store.setState({ defaultUnit: unit });
      }),

    start: () => run(() => workouts.start()),
    pause: () => run(() => workouts.pause()),
    resume: () => run(() => workouts.resume()),
    finish: () => run(() => workouts.finish()),

    recordSet: (setId) =>
      run(async () => {
        const handle = await workouts.recordSet(setId);
        // The outcome reaches the screen through the controller's snapshot; a failed save is shown there too.
        handle.settled.catch(() => undefined);
      }),

    stopSet: () => run(() => workouts.stopSet()),
    retrySave: () => run(() => workouts.retryPendingSave()),
    dismissError: () => store.setState({ actionError: null }),
  }));

  /** Whether a recorder snapshot belongs to the workout's recording set (its linked recording). */
  const ownedBySet = (live: SessionSnapshot, workout: WorkoutSnapshot): boolean => {
    const set = workout.record?.sets.find((s) => s.id === workout.recordingSetId);
    return set?.recording_session_id != null && live.sessionId === set.recording_session_id;
  };

  controller.subscribe((live) =>
    store.setState(ownedBySet(live, store.getState().workout) ? { live, recordingLive: live } : { live }),
  );
  workouts.subscribe((workout) => {
    const current = controller.getSnapshot();
    // Keep the set's last own snapshot while its save is pending; clear it once no set records.
    const recordingLive =
      workout.recordingSetId === null ? null : ownedBySet(current, workout) ? current : store.getState().recordingLive;
    store.setState({ workout, recordingLive });
    void loadLastTime().catch(() => undefined);
    void loadOutcomes().catch(() => undefined);
  });
  return store;
}
