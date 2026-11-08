import type { RepEvent } from '@repone/sensor-contracts';
import type {
  Exercise,
  Machine,
  MotionType,
  Resistance,
  Workout,
  WorkoutExercise,
  WorkoutRecord,
  WorkoutSet,
  WorkoutStatus,
} from './model';
import { isValidResistance } from './resistance';

/**
 * Workout lifecycle (RO-013, ADR 0010 — Proposed). Pure functions: each takes a `WorkoutRecord` (and the time, in
 * epoch ms, where it matters) and returns a new record, or throws. Nothing here does I/O; persistence stores the
 * returned records.
 *
 *   planned ──start──▶ active ──pause──▶ paused ──resume──▶ active
 *                        │                  │
 *                        └──────finish──────┴──▶ finished (read-only)
 *
 * A set records only while the workout is active, one set at a time. Pausing or finishing is refused while a set is
 * recording, so a recording's samples stay continuous (decision 5 of the RO-013 plan).
 */

export type WorkoutAction = 'start' | 'pause' | 'resume' | 'finish';

/** An action not allowed from the workout's current status. */
export class WorkoutTransitionError extends Error {
  constructor(
    readonly from: WorkoutStatus,
    readonly action: WorkoutAction,
  ) {
    super(`Cannot ${action} a workout that is ${from}`);
    this.name = 'WorkoutTransitionError';
  }
}

export type WorkoutRuleCode =
  | 'finished_read_only'
  | 'set_recording'
  | 'not_active'
  | 'unknown_exercise'
  | 'unknown_set'
  | 'set_not_planned'
  | 'set_not_recording'
  | 'duplicate_id'
  | 'invalid_name'
  | 'invalid_resistance'
  | 'invalid_time';

/** Any other rule the workout would break. `code` is stable for callers; `message` is for people. */
export class WorkoutRuleError extends Error {
  constructor(
    readonly code: WorkoutRuleCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkoutRuleError';
  }
}

const TRANSITIONS: Record<WorkoutAction, { readonly from: readonly WorkoutStatus[]; readonly to: WorkoutStatus }> = {
  start: { from: ['planned'], to: 'active' },
  pause: { from: ['active'], to: 'paused' },
  resume: { from: ['paused'], to: 'active' },
  finish: { from: ['active', 'paused'], to: 'finished' },
};

const MAX_NAME_LENGTH = 80;

function cleanName(name: string, what: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new WorkoutRuleError('invalid_name', `${what} name must be 1–${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

export function newMachine(input: {
  id: string;
  name: string;
  motionType: MotionType;
  notes?: string | null;
  nowEpochMs: number;
}): Machine {
  const notes = input.notes?.trim() || null;
  return {
    id: input.id,
    name: cleanName(input.name, 'Machine'),
    motion_type: input.motionType,
    notes,
    created_at_epoch_ms: input.nowEpochMs,
  };
}

export function newExercise(input: { id: string; name: string; nowEpochMs: number }): Exercise {
  return { id: input.id, name: cleanName(input.name, 'Exercise'), created_at_epoch_ms: input.nowEpochMs };
}

export function newWorkout(id: string, nowEpochMs: number): WorkoutRecord {
  return {
    workout: {
      id,
      status: 'planned',
      created_at_epoch_ms: nowEpochMs,
      started_at_epoch_ms: null,
      ended_at_epoch_ms: null,
      pauses: [],
    },
    exercises: [],
    sets: [],
  };
}

function transition(record: WorkoutRecord, action: WorkoutAction): WorkoutStatus {
  const { from, to } = TRANSITIONS[action];
  if (!from.includes(record.workout.status)) throw new WorkoutTransitionError(record.workout.status, action);
  return to;
}

function lastEventTime(workout: Workout): number {
  const lastPause = workout.pauses[workout.pauses.length - 1];
  return Math.max(workout.started_at_epoch_ms ?? workout.created_at_epoch_ms, lastPause?.end_epoch_ms ?? lastPause?.start_epoch_ms ?? -Infinity);
}

function requireTimeNotBefore(workout: Workout, nowEpochMs: number): void {
  if (!Number.isFinite(nowEpochMs) || nowEpochMs < lastEventTime(workout)) {
    throw new WorkoutRuleError('invalid_time', 'Time cannot go backwards within a workout');
  }
}

function recordingSet(record: WorkoutRecord): WorkoutSet | undefined {
  return record.sets.find((s) => s.status === 'recording');
}

function requireNoRecording(record: WorkoutRecord, action: WorkoutAction): void {
  if (recordingSet(record)) {
    throw new WorkoutRuleError('set_recording', `Stop the set that is recording before you ${action} the workout`);
  }
}

function requireEditable(record: WorkoutRecord): void {
  if (record.workout.status === 'finished') {
    throw new WorkoutRuleError('finished_read_only', 'A finished workout cannot be changed');
  }
}

export function startWorkout(record: WorkoutRecord, nowEpochMs: number): WorkoutRecord {
  const status = transition(record, 'start');
  if (!Number.isFinite(nowEpochMs) || nowEpochMs < record.workout.created_at_epoch_ms) {
    throw new WorkoutRuleError('invalid_time', 'A workout cannot start before it was created');
  }
  return { ...record, workout: { ...record.workout, status, started_at_epoch_ms: nowEpochMs } };
}

export function pauseWorkout(record: WorkoutRecord, nowEpochMs: number): WorkoutRecord {
  const status = transition(record, 'pause');
  requireNoRecording(record, 'pause');
  requireTimeNotBefore(record.workout, nowEpochMs);
  const pauses = [...record.workout.pauses, { start_epoch_ms: nowEpochMs, end_epoch_ms: null }];
  return { ...record, workout: { ...record.workout, status, pauses } };
}

export function resumeWorkout(record: WorkoutRecord, nowEpochMs: number): WorkoutRecord {
  const status = transition(record, 'resume');
  requireTimeNotBefore(record.workout, nowEpochMs);
  return { ...record, workout: { ...record.workout, status, pauses: closeOpenPause(record.workout, nowEpochMs) } };
}

export function finishWorkout(record: WorkoutRecord, nowEpochMs: number): WorkoutRecord {
  const status = transition(record, 'finish');
  requireNoRecording(record, 'finish');
  requireTimeNotBefore(record.workout, nowEpochMs);
  return {
    ...record,
    workout: { ...record.workout, status, ended_at_epoch_ms: nowEpochMs, pauses: closeOpenPause(record.workout, nowEpochMs) },
  };
}

function closeOpenPause(workout: Workout, nowEpochMs: number) {
  return workout.pauses.map((p) => (p.end_epoch_ms === null ? { ...p, end_epoch_ms: nowEpochMs } : p));
}

/** Append an exercise at the end of the workout. Allowed until the workout is finished. */
export function addExercise(
  record: WorkoutRecord,
  input: { id: string; exerciseId: string; machineId?: string | null },
): WorkoutRecord {
  requireEditable(record);
  requireNewId(record, input.id);
  const exercise: WorkoutExercise = {
    id: input.id,
    workout_id: record.workout.id,
    exercise_id: input.exerciseId,
    machine_id: input.machineId ?? null,
    position: nextPosition(record.exercises.map((e) => e.position)),
  };
  return { ...record, exercises: [...record.exercises, exercise] };
}

/** Append a planned set to a workout exercise. Allowed until the workout is finished. */
export function addSet(
  record: WorkoutRecord,
  input: { id: string; workoutExerciseId: string; resistance?: Resistance | null },
): WorkoutRecord {
  requireEditable(record);
  requireNewId(record, input.id);
  if (!record.exercises.some((e) => e.id === input.workoutExerciseId)) {
    throw new WorkoutRuleError('unknown_exercise', 'That exercise is not part of this workout');
  }
  const resistance = input.resistance ?? null;
  requireValidResistance(resistance);
  const set: WorkoutSet = {
    id: input.id,
    workout_exercise_id: input.workoutExerciseId,
    position: nextPosition(record.sets.filter((s) => s.workout_exercise_id === input.workoutExerciseId).map((s) => s.position)),
    status: 'planned',
    recording_session_id: null,
    resistance,
  };
  return { ...record, sets: [...record.sets, set] };
}

/** Set or clear (null) a set's user-entered resistance, also after it was recorded, until the workout is finished. */
export function setResistance(record: WorkoutRecord, setId: string, resistance: Resistance | null): WorkoutRecord {
  requireEditable(record);
  requireValidResistance(resistance);
  return updateSet(record, setId, (set) => ({ ...set, resistance }));
}

/** A planned set starts recording into `recordingSessionId`. The workout must be active, with no other set recording. */
export function beginSetRecording(record: WorkoutRecord, setId: string, recordingSessionId: string): WorkoutRecord {
  requireEditable(record);
  if (record.workout.status !== 'active') {
    throw new WorkoutRuleError('not_active', 'Start or resume the workout before recording a set');
  }
  if (recordingSet(record)) throw new WorkoutRuleError('set_recording', 'Another set is already recording');
  return updateSet(record, setId, (set) => {
    if (set.status !== 'planned') throw new WorkoutRuleError('set_not_planned', 'This set has already been recorded');
    return { ...set, status: 'recording', recording_session_id: recordingSessionId };
  });
}

/** The recording set's recording ended (stopped, or ended by a sensor error): the set is completed. */
export function endSetRecording(record: WorkoutRecord, setId: string): WorkoutRecord {
  return updateSet(record, setId, (set) => {
    if (set.status !== 'recording') throw new WorkoutRuleError('set_not_recording', 'This set is not recording');
    return { ...set, status: 'completed' };
  });
}

function updateSet(record: WorkoutRecord, setId: string, change: (set: WorkoutSet) => WorkoutSet): WorkoutRecord {
  const index = record.sets.findIndex((s) => s.id === setId);
  if (index === -1) throw new WorkoutRuleError('unknown_set', 'That set is not part of this workout');
  const sets = [...record.sets];
  sets[index] = change(sets[index]!);
  return { ...record, sets };
}

function requireNewId(record: WorkoutRecord, id: string): void {
  if (id === record.workout.id || record.exercises.some((e) => e.id === id) || record.sets.some((s) => s.id === id)) {
    throw new WorkoutRuleError('duplicate_id', `The id ${id} is already used in this workout`);
  }
}

function requireValidResistance(resistance: Resistance | null): void {
  if (resistance !== null && !isValidResistance(resistance)) {
    throw new WorkoutRuleError('invalid_resistance', 'Resistance must be a positive user-entered value in kg or lb');
  }
}

function nextPosition(positions: readonly number[]): number {
  return positions.length === 0 ? 0 : Math.max(...positions) + 1;
}

/**
 * Time spent working out, ms: from start to finish (or `nowEpochMs` while not finished), minus pauses. 0 before the
 * workout starts.
 */
export function activeDurationMs(workout: Workout, nowEpochMs: number): number {
  if (workout.started_at_epoch_ms === null) return 0;
  const end = workout.ended_at_epoch_ms ?? nowEpochMs;
  const paused = workout.pauses.reduce((sum, p) => sum + (Math.min(p.end_epoch_ms ?? end, end) - p.start_epoch_ms), 0);
  return Math.max(0, end - workout.started_at_epoch_ms - paused);
}

/**
 * A set's reps, from the rep events of its recording: `full` reps count toward the set, `partial` reps are logged with
 * their label (ADR 0003 §6). Counted on read; nothing is stored twice.
 */
export function summarizeSetReps(events: readonly RepEvent[]): { full_rep_count: number; partial_rep_count: number } {
  let full = 0;
  let partial = 0;
  for (const event of events) {
    if (event.classification === 'full') full += 1;
    else partial += 1;
  }
  return { full_rep_count: full, partial_rep_count: partial };
}

/**
 * Every invariant a stored workout must satisfy, as a list of problems (empty = valid). Persistence runs it before
 * saving, so a record built outside these functions cannot store an inconsistent workout.
 */
export function validateWorkoutRecord(record: WorkoutRecord): string[] {
  const problems: string[] = [];
  const { workout, exercises, sets } = record;
  const statusShape: Record<WorkoutStatus, boolean> = {
    planned: workout.started_at_epoch_ms === null && workout.ended_at_epoch_ms === null && workout.pauses.length === 0,
    active: workout.started_at_epoch_ms !== null && workout.ended_at_epoch_ms === null && workout.pauses.every((p) => p.end_epoch_ms !== null),
    paused:
      workout.started_at_epoch_ms !== null &&
      workout.ended_at_epoch_ms === null &&
      workout.pauses.length > 0 &&
      workout.pauses[workout.pauses.length - 1]!.end_epoch_ms === null,
    finished: workout.started_at_epoch_ms !== null && workout.ended_at_epoch_ms !== null && workout.pauses.every((p) => p.end_epoch_ms !== null),
  };
  if (!statusShape[workout.status]) problems.push(`times and pauses do not fit status ${workout.status}`);

  // Every timestamp is a finite number, and created ≤ started ≤ ended (Codex P1, PR #33): the status check above only
  // establishes which ones are present.
  const times = [
    workout.created_at_epoch_ms,
    workout.started_at_epoch_ms,
    workout.ended_at_epoch_ms,
    ...workout.pauses.flatMap((p) => [p.start_epoch_ms, p.end_epoch_ms]),
  ];
  if (times.some((t) => t !== null && !Number.isFinite(t))) problems.push('a timestamp is not a finite number');
  if (workout.started_at_epoch_ms !== null && workout.started_at_epoch_ms < workout.created_at_epoch_ms) {
    problems.push('the workout starts before it was created');
  }
  if (workout.ended_at_epoch_ms !== null && workout.ended_at_epoch_ms < (workout.started_at_epoch_ms ?? workout.created_at_epoch_ms)) {
    problems.push('the workout ends before it starts');
  }

  let previousEnd = workout.started_at_epoch_ms ?? -Infinity;
  for (const [i, pause] of workout.pauses.entries()) {
    if (pause.start_epoch_ms < previousEnd) problems.push(`pause ${i} overlaps the previous pause or precedes the start`);
    if (pause.end_epoch_ms !== null && pause.end_epoch_ms < pause.start_epoch_ms) problems.push(`pause ${i} ends before it starts`);
    if (workout.ended_at_epoch_ms !== null && (pause.end_epoch_ms ?? Infinity) > workout.ended_at_epoch_ms) {
      problems.push(`pause ${i} extends past the end of the workout`);
    }
    previousEnd = pause.end_epoch_ms ?? Infinity;
  }

  const ids = [workout.id, ...exercises.map((e) => e.id), ...sets.map((s) => s.id)];
  if (new Set(ids).size !== ids.length) problems.push('ids are not unique');
  if (exercises.some((e) => e.workout_id !== workout.id)) problems.push('an exercise belongs to another workout');
  if (!unique(exercises.map((e) => e.position))) problems.push('exercise positions are not unique');
  for (const exercise of exercises) {
    if (!unique(sets.filter((s) => s.workout_exercise_id === exercise.id).map((s) => s.position))) {
      problems.push(`set positions of exercise ${exercise.id} are not unique`);
    }
  }
  if (sets.some((s) => !exercises.some((e) => e.id === s.workout_exercise_id))) problems.push('a set belongs to no exercise');
  if (sets.filter((s) => s.status === 'recording').length > 1) problems.push('more than one set is recording');
  if (sets.some((s) => s.status === 'recording') && workout.status !== 'active') problems.push('a set is recording while the workout is not active');
  for (const set of sets) {
    if ((set.status === 'planned') !== (set.recording_session_id === null)) {
      problems.push(`set ${set.id}: only a planned set has no recording`);
    }
    if (set.resistance !== null && !isValidResistance(set.resistance)) problems.push(`set ${set.id}: invalid resistance`);
  }
  return problems;
}

function unique(values: readonly number[]): boolean {
  return new Set(values).size === values.length;
}
