import type { DataProvenance } from '@repone/sensor-contracts';
import type { Repositories, SessionOutcome, SetResult, WorkoutSummary } from '@repone/workout-domain';

/** One set of a past workout, as History's detail shows it. */
export interface WorkoutSetItem {
  readonly result: SetResult;
  /** "Row · Seated row". */
  readonly exerciseTitle: string;
  /** 1-based within its exercise. */
  readonly number: number;
  /** How the set's recording ended; null when not recorded or not stored. */
  readonly outcome: SessionOutcome | null;
}

export interface WorkoutListItem {
  readonly summary: WorkoutSummary;
  /**
   * The least real provenance among the recordings its totals include (as for every rep total): completed sets and
   * a set still recording, whose saved rep events already count (Codex P1 on PR #47). Null when nothing is recorded.
   */
  readonly provenance: DataProvenance | null;
  /** Exercise names in workout order. */
  readonly exerciseNames: readonly string[];
  /** Each set, in exercise then set order. */
  readonly sets: readonly WorkoutSetItem[];
}

/** The provenance a total must be labelled with: the least real one in it. */
export function leastRealProvenance(kinds: Iterable<DataProvenance | null>): DataProvenance | null {
  const seen = new Set(kinds);
  if (seen.has('simulated')) return 'simulated';
  if (seen.has('replay')) return 'replay';
  if (seen.has('sensor')) return 'sensor';
  return null;
}

/**
 * Recent workouts with their sets, newest first, read from storage only. Counts come from the stored rep events
 * (full reps counted, partials listed); nothing is estimated.
 */
export async function loadWorkoutList(repositories: Repositories, limit: number): Promise<WorkoutListItem[]> {
  const [summaries, exercises, machines] = await Promise.all([
    repositories.workouts.listRecent(limit),
    repositories.exercises.list(),
    repositories.machines.list(),
  ]);
  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]));
  const machineName = new Map(machines.map((m) => [m.id, m.name]));

  return Promise.all(
    summaries.map(async (summary) => {
      const [record, results] = await Promise.all([
        repositories.workouts.getById(summary.workout.id),
        repositories.workouts.listSetResults(summary.workout.id),
      ]);
      const entries = record?.exercises ?? [];
      const titles = new Map(
        entries.map((e) => [e.id, [exerciseName.get(e.exercise_id) ?? 'Exercise', e.machine_id ? machineName.get(e.machine_id) : undefined].filter(Boolean).join(' · ')]),
      );
      const counters = new Map<string, number>();
      const sets = await Promise.all(
        results.map(async (result) => {
          const number = (counters.get(result.set.workout_exercise_id) ?? 0) + 1;
          counters.set(result.set.workout_exercise_id, number);
          const outcome = result.set.recording_session_id ? await repositories.sessions.getOutcome(result.set.recording_session_id) : null;
          return { result, exerciseTitle: titles.get(result.set.workout_exercise_id) ?? 'Exercise', number, outcome };
        }),
      );
      return {
        summary,
        provenance: leastRealProvenance(results.filter((r) => r.set.recording_session_id !== null).map((r) => r.provenance)),
        exerciseNames: entries.map((e) => exerciseName.get(e.exercise_id) ?? 'Exercise'),
        sets,
      };
    }),
  );
}
