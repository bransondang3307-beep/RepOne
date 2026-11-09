import type {
  DataProvenance,
  RawSensorSample,
  RepCalibration,
  RepEvent,
  SensorErrorCode,
  SensorSourceKind,
} from '@repone/sensor-contracts';
import type { Exercise, Machine, Resistance, Workout, WorkoutRecord, WorkoutSet } from './model';

export interface WorkoutSession {
  readonly id: string;
  readonly activity_type: 'gym';
  /** `simulated` / `replay` sessions must never be presented as real measurements. */
  readonly provenance: DataProvenance;
  readonly source_id: string;
  readonly source_kind: SensorSourceKind;
  readonly calibration_id: string;
  readonly algorithm_version: string;
  /** Free-text machine/exercise label entered by the user (machine profiles come later). */
  readonly machine_label: string | null;
  readonly started_at_epoch_ms: number;
  readonly ended_at_epoch_ms: number | null;
}

export interface WorkoutSessionSummary extends WorkoutSession {
  readonly full_rep_count: number;
  readonly partial_rep_count: number;
}

/**
 * Why a recording ended (ADR 0007 Decision 1, stored from RO-013 / ADR 0010). Recordings saved before that have no
 * outcome (null), which means "not recorded", not "stopped".
 */
export type SessionEndReason = 'stopped' | 'stream_ended' | 'sensor_error' | 'start_failed' | 'write_failed';

export interface SessionOutcome {
  readonly end_reason: SessionEndReason;
  /** The sensor's error code when the sensor failed or could not start; null otherwise. */
  readonly sensor_error_code: SensorErrorCode | null;
}

export interface SessionRepository {
  create(session: WorkoutSession): Promise<void>;
  /** Mark the recording ended; `outcome` (RO-013) records why. Omitted, the outcome stays unknown. */
  markEnded(sessionId: string, endedAtEpochMs: number, outcome?: SessionOutcome): Promise<void>;
  /** The stored outcome; null for an unknown recording, one still running, or one saved without an outcome. */
  getOutcome(sessionId: string): Promise<SessionOutcome | null>;
  getById(sessionId: string): Promise<WorkoutSession | null>;
  /** Most recent first. */
  listRecent(limit: number): Promise<WorkoutSessionSummary[]>;
}

export interface RawSampleRepository {
  appendBatch(sessionId: string, samples: readonly RawSensorSample[]): Promise<void>;
  listBySession(sessionId: string): Promise<RawSensorSample[]>;
}

export interface RepEventRepository {
  /**
   * `sourceId` (RO-013, ADR 0007 Decision 3): the `source_id` of the sensor channel the rep was detected on. Omitted
   * or null, it stays unknown, as for events saved before RO-013.
   */
  append(event: RepEvent, sourceId?: string | null): Promise<void>;
  listBySession(sessionId: string): Promise<RepEvent[]>;
  /** The channel `source_id` stored with each event, in `listBySession` order (null where unknown). */
  listSourceIdsBySession(sessionId: string): Promise<Array<string | null>>;
}

export interface CalibrationRepository {
  save(calibration: RepCalibration): Promise<void>;
  getById(calibrationId: string): Promise<RepCalibration | null>;
}

export interface MachineRepository {
  /** Insert or update. */
  save(machine: Machine): Promise<void>;
  getById(machineId: string): Promise<Machine | null>;
  /** Alphabetical by name. */
  list(): Promise<Machine[]>;
}

export interface ExerciseRepository {
  /** Insert or update. */
  save(exercise: Exercise): Promise<void>;
  getById(exerciseId: string): Promise<Exercise | null>;
  /** Alphabetical by name. */
  list(): Promise<Exercise[]>;
  /** Associate an exercise with a machine (many-to-many). Linking twice is a no-op; both must exist. */
  link(exerciseId: string, machineId: string): Promise<void>;
  unlink(exerciseId: string, machineId: string): Promise<void>;
  /** Machines linked to the exercise, alphabetical. */
  machinesFor(exerciseId: string): Promise<Machine[]>;
  /** Exercises linked to the machine, alphabetical. */
  exercisesFor(machineId: string): Promise<Exercise[]>;
}

/** A workout in a history list. Rep counts come from the linked recordings' rep events. */
export interface WorkoutSummary {
  readonly workout: Workout;
  readonly exercise_count: number;
  readonly set_count: number;
  readonly completed_set_count: number;
  readonly full_rep_count: number;
  readonly partial_rep_count: number;
}

/** One set with what it produced: rep counts and the provenance of its recording. */
export interface SetResult {
  readonly set: WorkoutSet;
  readonly workout_id: string;
  readonly exercise_id: string;
  readonly machine_id: string | null;
  readonly full_rep_count: number;
  readonly partial_rep_count: number;
  /** The recording's provenance; null before the set is recorded. `simulated`/`replay` are never real measurements. */
  readonly provenance: DataProvenance | null;
}

/** A past set of one exercise, newest first: for showing what was done (and the resistance entered) last time. */
export interface ExerciseHistoryEntry extends SetResult {
  readonly workout_started_at_epoch_ms: number | null;
  readonly resistance: Resistance | null;
}

export interface WorkoutRepository {
  /**
   * Store the whole workout (insert or replace its exercises, sets and pauses) atomically. Throws if
   * `validateWorkoutRecord` reports a problem, or if a referenced exercise, machine or recording does not exist.
   */
  save(record: WorkoutRecord): Promise<void>;
  getById(workoutId: string): Promise<WorkoutRecord | null>;
  /** Most recently created first. */
  listRecent(limit: number): Promise<WorkoutSummary[]>;
  /** Each set of the workout, in exercise then set order. */
  listSetResults(workoutId: string): Promise<SetResult[]>;
  /** Recorded (completed) sets of an exercise across workouts, newest first. */
  listExerciseHistory(exerciseId: string, limit: number): Promise<ExerciseHistoryEntry[]>;
  /** Delete a workout with its exercises, sets and pauses. Its recordings, samples and rep events are kept. */
  delete(workoutId: string): Promise<void>;
}

/** Everything the session layer needs from storage, injected as one bundle. */
export interface Repositories {
  readonly sessions: SessionRepository;
  readonly rawSamples: RawSampleRepository;
  readonly repEvents: RepEventRepository;
  readonly calibrations: CalibrationRepository;
  /** RO-013 (ADR 0010). */
  readonly machines: MachineRepository;
  readonly exercises: ExerciseRepository;
  readonly workouts: WorkoutRepository;
}
