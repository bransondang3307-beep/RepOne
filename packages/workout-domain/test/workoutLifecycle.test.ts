import type { RepEvent } from '@repone/sensor-contracts';
import {
  KG_PER_LB,
  ResistanceError,
  WorkoutRuleError,
  WorkoutTransitionError,
  activeDurationMs,
  addExercise,
  addSet,
  beginSetRecording,
  endSetRecording,
  enterResistance,
  finishWorkout,
  formatResistance,
  isValidResistance,
  newExercise,
  newMachine,
  newWorkout,
  pauseWorkout,
  resistanceIn,
  resumeWorkout,
  setResistance,
  startWorkout,
  summarizeSetReps,
  validateWorkoutRecord,
  type Resistance,
  type WorkoutRecord,
} from '../src';

const T0 = 1_700_000_000_000;

/** A started workout with one exercise and two planned sets. */
function started(): WorkoutRecord {
  let r = newWorkout('w1', T0);
  r = startWorkout(r, T0 + 1000);
  r = addExercise(r, { id: 'we1', exerciseId: 'ex-row', machineId: 'm-row' });
  r = addSet(r, { id: 's1', workoutExerciseId: 'we1', resistance: enterResistance(40, 'kg') });
  r = addSet(r, { id: 's2', workoutExerciseId: 'we1' });
  return r;
}

const ruleCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof WorkoutRuleError) return error.code;
    throw error;
  }
  return 'no error';
};

describe('user-entered resistance', () => {
  it('stores kg canonically and reads back in the entered unit', () => {
    const lb = enterResistance(100, 'lb');
    expect(lb).toEqual({ kg: 100 * KG_PER_LB, entered_unit: 'lb', source: 'user_entered' });
    expect(resistanceIn(lb)).toBe(100);
    expect(resistanceIn(lb, 'kg')).toBe(45.36);
    expect(formatResistance(lb)).toBe('100 lb');
    expect(formatResistance(enterResistance(42.5, 'kg'))).toBe('42.5 kg');
    expect(resistanceIn(enterResistance(22.5, 'lb'))).toBe(22.5);
  });

  it('rejects zero, negative, non-finite, typo-sized values and unknown units', () => {
    for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 1001]) {
      expect(() => enterResistance(value, 'kg')).toThrow(ResistanceError);
    }
    expect(() => enterResistance(10, 'stone' as never)).toThrow(ResistanceError);
  });

  it('has no measured source: anything other than user_entered is invalid', () => {
    const measured = { kg: 50, entered_unit: 'kg', source: 'measured' } as unknown as Resistance;
    expect(isValidResistance(measured)).toBe(false);
    expect(ruleCode(() => setResistance(started(), 's2', measured))).toBe('invalid_resistance');
  });
});

describe('machines and exercises', () => {
  it('trims names and keeps the motion type (the detector supports rotational only)', () => {
    expect(newMachine({ id: 'm1', name: '  Seated row ', motionType: 'linear', nowEpochMs: T0 })).toEqual({
      id: 'm1',
      name: 'Seated row',
      motion_type: 'linear',
      notes: null,
      created_at_epoch_ms: T0,
    });
    expect(newExercise({ id: 'e1', name: 'Row', nowEpochMs: T0 }).name).toBe('Row');
  });

  it('rejects empty and over-long names', () => {
    expect(ruleCode(() => newExercise({ id: 'e1', name: '   ', nowEpochMs: T0 }))).toBe('invalid_name');
    expect(ruleCode(() => newMachine({ id: 'm1', name: 'x'.repeat(81), motionType: 'unknown', nowEpochMs: T0 }))).toBe(
      'invalid_name',
    );
  });
});

describe('workout lifecycle', () => {
  it('planned → active → paused → active → finished, with pauses recorded and closed', () => {
    let r = newWorkout('w1', T0);
    expect(r.workout.status).toBe('planned');
    r = startWorkout(r, T0 + 1000);
    r = pauseWorkout(r, T0 + 61_000);
    expect(r.workout).toMatchObject({ status: 'paused', pauses: [{ start_epoch_ms: T0 + 61_000, end_epoch_ms: null }] });
    r = resumeWorkout(r, T0 + 121_000);
    r = finishWorkout(r, T0 + 181_000);
    expect(r.workout).toMatchObject({
      status: 'finished',
      started_at_epoch_ms: T0 + 1000,
      ended_at_epoch_ms: T0 + 181_000,
      pauses: [{ start_epoch_ms: T0 + 61_000, end_epoch_ms: T0 + 121_000 }],
    });
    expect(activeDurationMs(r.workout, T0 + 999_999)).toBe(120_000);
    expect(validateWorkoutRecord(r)).toEqual([]);
  });

  it('finishing while paused closes the open pause at the finish time', () => {
    let r = startWorkout(newWorkout('w1', T0), T0);
    r = pauseWorkout(r, T0 + 10_000);
    r = finishWorkout(r, T0 + 30_000);
    expect(r.workout.pauses).toEqual([{ start_epoch_ms: T0 + 10_000, end_epoch_ms: T0 + 30_000 }]);
    expect(activeDurationMs(r.workout, T0 + 50_000)).toBe(10_000);
  });

  it('counts an open pause up to now, and nothing before the start', () => {
    expect(activeDurationMs(newWorkout('w1', T0).workout, T0 + 5000)).toBe(0);
    let r = startWorkout(newWorkout('w1', T0), T0);
    r = pauseWorkout(r, T0 + 4000);
    expect(activeDurationMs(r.workout, T0 + 9000)).toBe(4000);
  });

  it.each([
    ['pause', 'planned', (r: WorkoutRecord) => pauseWorkout(r, T0)],
    ['resume', 'planned', (r: WorkoutRecord) => resumeWorkout(r, T0)],
    ['finish', 'planned', (r: WorkoutRecord) => finishWorkout(r, T0)],
  ] as const)('refuses %s from %s with a WorkoutTransitionError', (action, from, run) => {
    const error = (() => {
      try {
        run(newWorkout('w1', T0));
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(WorkoutTransitionError);
    expect(error).toMatchObject({ from, action });
  });

  it('refuses every action on a finished workout, and every edit', () => {
    const finished = finishWorkout(started(), T0 + 5000);
    for (const run of [
      () => startWorkout(finished, T0 + 6000),
      () => pauseWorkout(finished, T0 + 6000),
      () => resumeWorkout(finished, T0 + 6000),
      () => finishWorkout(finished, T0 + 6000),
    ]) {
      expect(run).toThrow(WorkoutTransitionError);
    }
    expect(ruleCode(() => addExercise(finished, { id: 'we2', exerciseId: 'x' }))).toBe('finished_read_only');
    expect(ruleCode(() => addSet(finished, { id: 's3', workoutExerciseId: 'we1' }))).toBe('finished_read_only');
    expect(ruleCode(() => setResistance(finished, 's1', null))).toBe('finished_read_only');
    expect(ruleCode(() => beginSetRecording(finished, 's2', 'rec'))).toBe('finished_read_only');
  });

  it('refuses times that go backwards', () => {
    expect(ruleCode(() => startWorkout(newWorkout('w1', T0), T0 - 1))).toBe('invalid_time');
    const r = startWorkout(newWorkout('w1', T0), T0 + 1000);
    expect(ruleCode(() => pauseWorkout(r, T0 + 999))).toBe('invalid_time');
    const paused = pauseWorkout(r, T0 + 2000);
    expect(ruleCode(() => resumeWorkout(paused, T0 + 1999))).toBe('invalid_time');
  });
});

describe('exercises and sets', () => {
  it('appends exercises and sets in order, with unique positions per workout and per exercise', () => {
    let r = started();
    r = addExercise(r, { id: 'we2', exerciseId: 'ex-press' });
    r = addSet(r, { id: 's3', workoutExerciseId: 'we2' });
    expect(r.exercises.map((e) => [e.id, e.position, e.machine_id])).toEqual([
      ['we1', 0, 'm-row'],
      ['we2', 1, null],
    ]);
    expect(r.sets.map((s) => [s.id, s.workout_exercise_id, s.position, s.status])).toEqual([
      ['s1', 'we1', 0, 'planned'],
      ['s2', 'we1', 1, 'planned'],
      ['s3', 'we2', 0, 'planned'],
    ]);
    expect(validateWorkoutRecord(r)).toEqual([]);
  });

  it('allows planning exercises and sets before the workout starts', () => {
    let r = addExercise(newWorkout('w1', T0), { id: 'we1', exerciseId: 'ex' });
    r = addSet(r, { id: 's1', workoutExerciseId: 'we1' });
    expect(r.sets).toHaveLength(1);
    expect(validateWorkoutRecord(r)).toEqual([]);
  });

  it('rejects duplicate ids and sets for an exercise not in the workout', () => {
    expect(ruleCode(() => addSet(started(), { id: 's1', workoutExerciseId: 'we1' }))).toBe('duplicate_id');
    expect(ruleCode(() => addExercise(started(), { id: 'w1', exerciseId: 'x' }))).toBe('duplicate_id');
    expect(ruleCode(() => addSet(started(), { id: 's9', workoutExerciseId: 'nope' }))).toBe('unknown_exercise');
  });

  it('changes or clears resistance, also after the set was recorded', () => {
    let r = beginSetRecording(started(), 's1', 'rec-1');
    r = endSetRecording(r, 's1');
    r = setResistance(r, 's1', enterResistance(90, 'lb'));
    expect(r.sets[0]!.resistance).toEqual(enterResistance(90, 'lb'));
    r = setResistance(r, 's1', null);
    expect(r.sets[0]!.resistance).toBeNull();
  });
});

describe('recording sets', () => {
  it('records one set at a time while active: planned → recording → completed, linked to its recording', () => {
    let r = beginSetRecording(started(), 's1', 'rec-1');
    expect(r.sets[0]).toMatchObject({ status: 'recording', recording_session_id: 'rec-1' });
    expect(ruleCode(() => beginSetRecording(r, 's2', 'rec-2'))).toBe('set_recording');
    r = endSetRecording(r, 's1');
    expect(r.sets[0]).toMatchObject({ status: 'completed', recording_session_id: 'rec-1' });
    r = beginSetRecording(r, 's2', 'rec-2');
    expect(r.sets[1]!.status).toBe('recording');
    expect(validateWorkoutRecord(r)).toEqual([]);
  });

  it('refuses to pause or finish while a set is recording (a recording stays continuous)', () => {
    const r = beginSetRecording(started(), 's1', 'rec-1');
    expect(ruleCode(() => pauseWorkout(r, T0 + 5000))).toBe('set_recording');
    expect(ruleCode(() => finishWorkout(r, T0 + 5000))).toBe('set_recording');
  });

  it('refuses to record while planned or paused, to re-record a set, or to end a set that is not recording', () => {
    let planned = addExercise(newWorkout('w1', T0), { id: 'we1', exerciseId: 'ex' });
    planned = addSet(planned, { id: 's1', workoutExerciseId: 'we1' });
    expect(ruleCode(() => beginSetRecording(planned, 's1', 'rec'))).toBe('not_active');
    expect(ruleCode(() => beginSetRecording(pauseWorkout(started(), T0 + 2000), 's1', 'rec'))).toBe('not_active');
    const done = endSetRecording(beginSetRecording(started(), 's1', 'rec'), 's1');
    expect(ruleCode(() => beginSetRecording(done, 's1', 'rec-again'))).toBe('set_not_planned');
    expect(ruleCode(() => endSetRecording(done, 's2'))).toBe('set_not_recording');
    expect(ruleCode(() => endSetRecording(done, 'nope'))).toBe('unknown_set');
  });
});

describe('rep counts per set', () => {
  const event = (classification: 'full' | 'partial', t: number): RepEvent => ({
    session_id: 'rec-1',
    activity_type: 'gym',
    event_type: 'rep_completed',
    timestamp_ms: t,
    value: 1,
    classification,
    confidence: null,
    calibration_id: 'cal',
    algorithm_version: 'test',
    provenance: 'imu_algorithm',
    start_timestamp_ms: t - 1000,
    peak_excursion_rad: 1,
    quality_flags: ['synthetic'],
  });

  it('counts full reps toward the set and logs partials separately', () => {
    expect(summarizeSetReps([event('full', 1), event('partial', 2), event('full', 3)])).toEqual({
      full_rep_count: 2,
      partial_rep_count: 1,
    });
    expect(summarizeSetReps([])).toEqual({ full_rep_count: 0, partial_rep_count: 0 });
  });
});

describe('validateWorkoutRecord (the invariants persistence relies on)', () => {
  // Codex P1 on PR #33 at 5471636: these passed validation because only nullability was checked.
  it('reports workout times that are out of order or not finite', () => {
    const finished = finishWorkout(started(), T0 + 5000);
    const at = (patch: Partial<WorkoutRecord['workout']>): WorkoutRecord => ({ ...finished, workout: { ...finished.workout, ...patch } });
    expect(validateWorkoutRecord(at({ created_at_epoch_ms: 1000, started_at_epoch_ms: 2000, ended_at_epoch_ms: 1500 }))).toEqual([
      'the workout ends before it starts',
    ]);
    expect(validateWorkoutRecord(at({ started_at_epoch_ms: T0 - 1 }))).toEqual(['the workout starts before it was created']);
    const active = started();
    expect(validateWorkoutRecord({ ...active, workout: { ...active.workout, started_at_epoch_ms: Number.NaN } })).toEqual([
      'a timestamp is not a finite number',
    ]);
    expect(validateWorkoutRecord(at({ created_at_epoch_ms: Number.POSITIVE_INFINITY }))).toContain('a timestamp is not a finite number');
    const paused = pauseWorkout(started(), T0 + 2000);
    expect(
      validateWorkoutRecord({ ...paused, workout: { ...paused.workout, pauses: [{ start_epoch_ms: Number.NaN, end_epoch_ms: null }] } }),
    ).toContain('a timestamp is not a finite number');
  });

  it('accepts every record the lifecycle functions produce', () => {
    let r = started();
    expect(validateWorkoutRecord(r)).toEqual([]);
    r = pauseWorkout(r, T0 + 2000);
    expect(validateWorkoutRecord(r)).toEqual([]);
    r = resumeWorkout(r, T0 + 3000);
    r = beginSetRecording(r, 's1', 'rec');
    expect(validateWorkoutRecord(r)).toEqual([]);
    r = finishWorkout(endSetRecording(r, 's1'), T0 + 4000);
    expect(validateWorkoutRecord(r)).toEqual([]);
  });

  it('reports records that the lifecycle functions could never produce', () => {
    const r = started();
    const broken: WorkoutRecord = {
      workout: { ...r.workout, status: 'paused', pauses: [{ start_epoch_ms: T0, end_epoch_ms: null }] },
      exercises: [...r.exercises, { ...r.exercises[0]!, id: 'we2' }],
      sets: [
        { ...r.sets[0]!, status: 'recording', recording_session_id: 'a' },
        { ...r.sets[1]!, status: 'recording', recording_session_id: 'b', position: 0 },
        { ...r.sets[1]!, id: 's3', workout_exercise_id: 'ghost', recording_session_id: 'c' },
      ],
    };
    expect(validateWorkoutRecord(broken)).toEqual([
      'pause 0 overlaps the previous pause or precedes the start',
      'exercise positions are not unique',
      'set positions of exercise we1 are not unique',
      'a set belongs to no exercise',
      'more than one set is recording',
      'a set is recording while the workout is not active',
      'set s3: only a planned set has no recording',
    ]);
  });
});
