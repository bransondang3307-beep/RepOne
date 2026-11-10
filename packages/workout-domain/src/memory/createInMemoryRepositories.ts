import type { RawSensorSample, RepCalibration, RepEvent } from '@repone/sensor-contracts';
import type { Exercise, Machine, WorkoutRecord } from '../model';
import type {
  ExerciseHistoryEntry,
  Repositories,
  SessionOutcome,
  SetResult,
  WorkoutSession,
  WorkoutSummary,
} from '../repositories';
import { summarizeSetReps, validateWorkoutRecord } from '../workoutLifecycle';

const byName = <T extends { name: string; id: string }>(a: T, b: T) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** The stored order, as SQLite returns it: exercises by position, sets by exercise position then set position. */
function canonical(record: WorkoutRecord): WorkoutRecord {
  const exercises = [...record.exercises].sort((a, b) => a.position - b.position);
  const rank = new Map(exercises.map((e, i) => [e.id, i]));
  const sets = [...record.sets].sort(
    (a, b) => rank.get(a.workout_exercise_id)! - rank.get(b.workout_exercise_id)! || a.position - b.position,
  );
  return { ...record, exercises, sets };
}
/** Copies stored data so callers never share it. Plain JSON data only (no structuredClone: not in every runtime). */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Non-persistent repositories for tests and previews. Same contract as SQLite. */
export function createInMemoryRepositories(): Repositories {
  const sessions = new Map<string, WorkoutSession>();
  const outcomes = new Map<string, SessionOutcome>();
  const samples = new Map<string, RawSensorSample[]>();
  const events = new Map<string, Array<{ event: RepEvent; sourceId: string | null }>>();
  const calibrations = new Map<string, RepCalibration>();
  const machines = new Map<string, Machine>();
  const exercises = new Map<string, Exercise>();
  const links = new Set<string>();
  const workouts = new Map<string, WorkoutRecord>();
  const linkKey = (exerciseId: string, machineId: string) => JSON.stringify([exerciseId, machineId]);

  const repsOf = (recordingId: string | null) =>
    summarizeSetReps(recordingId === null ? [] : (events.get(recordingId) ?? []).map((e) => e.event));

  const setResults = (record: WorkoutRecord): SetResult[] =>
    [...record.exercises]
      .sort((a, b) => a.position - b.position)
      .flatMap((exercise) =>
        record.sets
          .filter((s) => s.workout_exercise_id === exercise.id)
          .sort((a, b) => a.position - b.position)
          .map((set) => ({
            set,
            workout_id: record.workout.id,
            exercise_id: exercise.exercise_id,
            machine_id: exercise.machine_id,
            ...repsOf(set.recording_session_id),
            provenance: set.recording_session_id === null ? null : (sessions.get(set.recording_session_id)?.provenance ?? null),
          })),
      );

  return {
    sessions: {
      async create(session) {
        if (sessions.has(session.id)) throw new Error(`Session ${session.id} already exists`);
        sessions.set(session.id, session);
      },
      async markEnded(sessionId, endedAtEpochMs, outcome) {
        const session = sessions.get(sessionId);
        if (!session) throw new Error(`Unknown session ${sessionId}`);
        sessions.set(sessionId, { ...session, ended_at_epoch_ms: endedAtEpochMs });
        if (outcome) outcomes.set(sessionId, { end_reason: outcome.end_reason, sensor_error_code: outcome.sensor_error_code });
      },
      async getOutcome(sessionId) {
        return outcomes.get(sessionId) ?? null;
      },
      async getById(sessionId) {
        return sessions.get(sessionId) ?? null;
      },
      async listRecent(limit) {
        return [...sessions.values()]
          .sort((a, b) => b.started_at_epoch_ms - a.started_at_epoch_ms)
          .slice(0, limit)
          .map((s) => ({ ...s, ...repsOf(s.id) }));
      },
    },
    rawSamples: {
      async appendBatch(sessionId, batch) {
        samples.set(sessionId, [...(samples.get(sessionId) ?? []), ...batch]);
      },
      async listBySession(sessionId) {
        return [...(samples.get(sessionId) ?? [])];
      },
    },
    repEvents: {
      async append(event, sourceId = null) {
        events.set(event.session_id, [...(events.get(event.session_id) ?? []), { event, sourceId }]);
      },
      async listBySession(sessionId) {
        return (events.get(sessionId) ?? []).map((e) => e.event);
      },
      async listSourceIdsBySession(sessionId) {
        return (events.get(sessionId) ?? []).map((e) => e.sourceId);
      },
    },
    calibrations: {
      async save(calibration) {
        calibrations.set(calibration.calibration_id, calibration);
      },
      async getById(calibrationId) {
        return calibrations.get(calibrationId) ?? null;
      },
    },
    machines: {
      async save(machine) {
        machines.set(machine.id, machine);
      },
      async getById(machineId) {
        return machines.get(machineId) ?? null;
      },
      async list() {
        return [...machines.values()].sort(byName);
      },
    },
    exercises: {
      async save(exercise) {
        exercises.set(exercise.id, exercise);
      },
      async getById(exerciseId) {
        return exercises.get(exerciseId) ?? null;
      },
      async list() {
        return [...exercises.values()].sort(byName);
      },
      async link(exerciseId, machineId) {
        if (!exercises.has(exerciseId)) throw new Error(`Unknown exercise ${exerciseId}`);
        if (!machines.has(machineId)) throw new Error(`Unknown machine ${machineId}`);
        links.add(linkKey(exerciseId, machineId));
      },
      async unlink(exerciseId, machineId) {
        links.delete(linkKey(exerciseId, machineId));
      },
      async machinesFor(exerciseId) {
        return [...machines.values()].filter((m) => links.has(linkKey(exerciseId, m.id))).sort(byName);
      },
      async exercisesFor(machineId) {
        return [...exercises.values()].filter((e) => links.has(linkKey(e.id, machineId))).sort(byName);
      },
    },
    workouts: {
      async save(record) {
        const problems = validateWorkoutRecord(record);
        if (problems.length > 0) throw new Error(`Invalid workout ${record.workout.id}: ${problems.join('; ')}`);
        for (const e of record.exercises) {
          if (!exercises.has(e.exercise_id)) throw new Error(`Unknown exercise ${e.exercise_id}`);
          if (e.machine_id !== null && !machines.has(e.machine_id)) throw new Error(`Unknown machine ${e.machine_id}`);
        }
        for (const s of record.sets) {
          if (s.recording_session_id !== null && !sessions.has(s.recording_session_id)) {
            throw new Error(`Unknown recording ${s.recording_session_id}`);
          }
        }
        workouts.set(record.workout.id, clone(canonical(record)));
      },
      async getById(workoutId) {
        const record = workouts.get(workoutId);
        return record ? clone(record) : null;
      },
      async listRecent(limit) {
        return [...workouts.values()]
          .sort((a, b) => b.workout.created_at_epoch_ms - a.workout.created_at_epoch_ms)
          .slice(0, limit)
          .map((record): WorkoutSummary => {
            const results = setResults(record);
            return {
              workout: clone(record.workout),
              exercise_count: record.exercises.length,
              set_count: record.sets.length,
              completed_set_count: record.sets.filter((s) => s.status === 'completed').length,
              full_rep_count: results.reduce((n, r) => n + r.full_rep_count, 0),
              partial_rep_count: results.reduce((n, r) => n + r.partial_rep_count, 0),
            };
          });
      },
      async listSetResults(workoutId) {
        const record = workouts.get(workoutId);
        return record ? clone(setResults(record)) : [];
      },
      async listExerciseHistory(exerciseId, limit) {
        // Newest workout first; within a workout, the last set first (exercise position, then set position).
        const entries: Array<{ entry: ExerciseHistoryEntry; order: number }> = [];
        for (const record of workouts.values()) {
          setResults(record).forEach((result, order) => {
            if (result.exercise_id !== exerciseId || result.set.status !== 'completed') return;
            entries.push({
              order,
              entry: { ...result, workout_started_at_epoch_ms: record.workout.started_at_epoch_ms, resistance: result.set.resistance },
            });
          });
        }
        const startOf = (e: ExerciseHistoryEntry) => e.workout_started_at_epoch_ms ?? -Infinity;
        entries.sort((a, b) => startOf(b.entry) - startOf(a.entry) || b.order - a.order);
        return clone(entries.slice(0, limit).map((e) => e.entry));
      },
      async delete(workoutId) {
        workouts.delete(workoutId);
      },
    },
  };
}
