/**
 * Workout domain model (RO-013, ADR 0010 — Proposed). Pure data: no I/O, no database, no UI.
 *
 * Hierarchy: Workout → WorkoutExercise → WorkoutSet → reps. A set's reps are not stored on the set: they are the rep
 * events of the sensor recording (`workout_sessions`) the set links to, counted on read (see `summarizeSetReps`).
 * Field names carry their units (`*_epoch_ms`, `*_kg`), as in the sensor contracts.
 */

/** How the machine's moving part moves. The rep detector supports `rotational` only; `linear` lets the app warn. */
export type MotionType = 'rotational' | 'linear' | 'unknown';

export interface Machine {
  readonly id: string;
  readonly name: string;
  readonly motion_type: MotionType;
  readonly notes: string | null;
  readonly created_at_epoch_ms: number;
}

export interface Exercise {
  readonly id: string;
  readonly name: string;
  readonly created_at_epoch_ms: number;
}

/** Many-to-many: the same exercise can be done on different machines (and gyms). */
export interface ExerciseMachineLink {
  readonly exercise_id: string;
  readonly machine_id: string;
}

export type MassUnit = 'kg' | 'lb';

/**
 * Resistance the user typed in. Always `user_entered`: the sensor cannot measure resistance (source of truth §1
 * principle 4), and no other source exists in the type, so nothing can be labelled measured.
 */
export interface Resistance {
  /** Canonical value, kilograms. */
  readonly kg: number;
  /** The unit the user entered it in; shown back in that unit. */
  readonly entered_unit: MassUnit;
  readonly source: 'user_entered';
}

export type WorkoutStatus = 'planned' | 'active' | 'paused' | 'finished';

export interface WorkoutPause {
  readonly start_epoch_ms: number;
  /** null while the pause is in progress. */
  readonly end_epoch_ms: number | null;
}

export interface Workout {
  readonly id: string;
  readonly status: WorkoutStatus;
  readonly created_at_epoch_ms: number;
  readonly started_at_epoch_ms: number | null;
  readonly ended_at_epoch_ms: number | null;
  /** In order, non-overlapping, inside [started, ended]. */
  readonly pauses: readonly WorkoutPause[];
}

/** One exercise within a workout, in order. */
export interface WorkoutExercise {
  readonly id: string;
  readonly workout_id: string;
  readonly exercise_id: string;
  readonly machine_id: string | null;
  /** 0-based, unique within the workout. */
  readonly position: number;
}

/** `planned`: not recorded yet. `recording`: its sensor recording is running. `completed`: recorded. */
export type SetStatus = 'planned' | 'recording' | 'completed';

export interface WorkoutSet {
  readonly id: string;
  readonly workout_exercise_id: string;
  /** 0-based, unique within its workout exercise. */
  readonly position: number;
  readonly status: SetStatus;
  /** The sensor recording (`workout_sessions.id`) whose rep events are this set's reps; null until recorded. */
  readonly recording_session_id: string | null;
  readonly resistance: Resistance | null;
}

/** A workout with its exercises and sets: the unit the lifecycle functions operate on. */
export interface WorkoutRecord {
  readonly workout: Workout;
  readonly exercises: readonly WorkoutExercise[];
  readonly sets: readonly WorkoutSet[];
}
