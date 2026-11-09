import {
  LABELLED_SET_SCRIPT,
  createSyntheticCalibration,
  generateTrace,
  type RepEvent,
} from '@repone/sensor-contracts';
import type { WorkoutRecord } from '../model';
import type { Repositories, WorkoutSession } from '../repositories';
import { enterResistance } from '../resistance';
import {
  addExercise,
  addSet,
  beginSetRecording,
  endSetRecording,
  finishWorkout,
  newExercise,
  newMachine,
  newWorkout,
  pauseWorkout,
  resumeWorkout,
  startWorkout,
} from '../workoutLifecycle';

const calibration = createSyntheticCalibration(1_700_000_000_000);

const session = (id: string, startedAt: number): WorkoutSession => ({
  id,
  activity_type: 'gym',
  provenance: 'simulated',
  source_id: 'sim-01',
  source_kind: 'simulated',
  calibration_id: calibration.calibration_id,
  algorithm_version: 'test-0.1',
  machine_label: 'Seated row (test rig)',
  started_at_epoch_ms: startedAt,
  ended_at_epoch_ms: null,
});

const repEvent = (sessionId: string, t: number, classification: 'full' | 'partial'): RepEvent => ({
  session_id: sessionId,
  activity_type: 'gym',
  event_type: 'rep_completed',
  timestamp_ms: t,
  value: 1,
  classification,
  confidence: null,
  calibration_id: calibration.calibration_id,
  algorithm_version: 'test-0.1',
  provenance: 'imu_algorithm',
  start_timestamp_ms: t - 1500,
  peak_excursion_rad: 1.1,
  quality_flags: ['synthetic'],
});

const T0 = 1_700_000_000_000;

/** A finished workout: one exercise on a machine, set s1 recorded into `recordingId`, set s2 never recorded. */
function finishedWorkout(id: string, startedAt: number, recordingId: string): WorkoutRecord {
  let r = newWorkout(id, startedAt);
  r = startWorkout(r, startedAt);
  r = addExercise(r, { id: `${id}-we1`, exerciseId: 'ex-row', machineId: 'm-row' });
  r = addSet(r, { id: `${id}-s1`, workoutExerciseId: `${id}-we1`, resistance: enterResistance(100, 'lb') });
  r = addSet(r, { id: `${id}-s2`, workoutExerciseId: `${id}-we1` });
  r = beginSetRecording(r, `${id}-s1`, recordingId);
  r = endSetRecording(r, `${id}-s1`);
  r = pauseWorkout(r, startedAt + 60_000);
  r = resumeWorkout(r, startedAt + 90_000);
  return finishWorkout(r, startedAt + 120_000);
}

const labelledSamples = () =>
  generateTrace(LABELLED_SET_SCRIPT, { sourceId: 'sim-01', sampleRateHz: 50, seed: 42, gyroNoiseRadS: 0.02 }).samples;

/**
 * Shared Jest contract suite: any Repositories implementation (in-memory,
 * SQLite, future sync-backed stores) must pass it. `create` must return an
 * empty, ready-to-use store for each test.
 */
export function describeRepositoriesContract(name: string, create: () => Promise<Repositories>): void {
  describe(`Repositories contract: ${name}`, () => {
    let repos: Repositories;
    beforeEach(async () => {
      repos = await create();
      await repos.calibrations.save(calibration);
    });

    it('round-trips calibrations', async () => {
      expect(await repos.calibrations.getById(calibration.calibration_id)).toEqual(calibration);
      expect(await repos.calibrations.getById('missing')).toBeNull();
    });

    it('creates, ends and fetches sessions', async () => {
      await repos.sessions.create(session('a', 1000));
      await repos.sessions.markEnded('a', 5000);
      expect(await repos.sessions.getById('a')).toEqual({ ...session('a', 1000), ended_at_epoch_ms: 5000 });
      expect(await repos.sessions.getById('missing')).toBeNull();
    });

    it('round-trips raw samples losslessly and in order', async () => {
      const samples = labelledSamples();
      await repos.sessions.create(session('a', 1000));
      await repos.rawSamples.appendBatch('a', samples.slice(0, 100));
      await repos.rawSamples.appendBatch('a', samples.slice(100, 250));
      expect(await repos.rawSamples.listBySession('a')).toEqual(samples.slice(0, 250));
      expect(await repos.rawSamples.listBySession('other')).toEqual([]);
    });

    it('round-trips rep events and summarises counts, most recent session first', async () => {
      await repos.sessions.create(session('old', 1000));
      await repos.sessions.create(session('new', 2000));
      const events = [repEvent('new', 3000, 'full'), repEvent('new', 6000, 'partial'), repEvent('new', 9000, 'full')];
      for (const e of events) await repos.repEvents.append(e);

      expect(await repos.repEvents.listBySession('new')).toEqual(events);
      const summaries = await repos.sessions.listRecent(10);
      expect(summaries.map((s) => [s.id, s.full_rep_count, s.partial_rep_count])).toEqual([
        ['new', 2, 1],
        ['old', 0, 0],
      ]);
      expect(await repos.sessions.listRecent(1)).toHaveLength(1);
    });

    // ---- RO-013 (ADR 0010) ---------------------------------------------------------------------------------

    it('stores why a recording ended; recordings ended without an outcome keep it unknown', async () => {
      await repos.sessions.create(session('a', 1000));
      await repos.sessions.create(session('b', 2000));
      await repos.sessions.create(session('c', 3000));
      await repos.sessions.markEnded('a', 5000, { end_reason: 'sensor_error', sensor_error_code: 'connection_lost' });
      await repos.sessions.markEnded('b', 6000);
      expect(await repos.sessions.getOutcome('a')).toEqual({ end_reason: 'sensor_error', sensor_error_code: 'connection_lost' });
      expect(await repos.sessions.getOutcome('b')).toBeNull();
      expect(await repos.sessions.getOutcome('c')).toBeNull();
      expect(await repos.sessions.getOutcome('missing')).toBeNull();
      // The session itself is unchanged by the outcome.
      expect(await repos.sessions.getById('a')).toEqual({ ...session('a', 1000), ended_at_epoch_ms: 5000 });
    });

    it("stores each rep event's channel source_id; events appended without one keep it unknown", async () => {
      await repos.sessions.create(session('a', 1000));
      await repos.repEvents.append(repEvent('a', 3000, 'full'), 'imu-0011-ch0');
      await repos.repEvents.append(repEvent('a', 6000, 'partial'));
      expect(await repos.repEvents.listSourceIdsBySession('a')).toEqual(['imu-0011-ch0', null]);
      expect(await repos.repEvents.listBySession('a')).toEqual([repEvent('a', 3000, 'full'), repEvent('a', 6000, 'partial')]);
    });

    it('saves, updates and lists machines and exercises, and links them many-to-many', async () => {
      const row = newMachine({ id: 'm-row', name: 'Seated row', motionType: 'rotational', nowEpochMs: T0 });
      const press = newMachine({ id: 'm-press', name: 'Chest press', motionType: 'linear', notes: 'gym A', nowEpochMs: T0 });
      await repos.machines.save(row);
      await repos.machines.save(press);
      await repos.machines.save({ ...row, notes: 'pin 7' });
      expect(await repos.machines.getById('m-row')).toEqual({ ...row, notes: 'pin 7' });
      expect(await repos.machines.getById('missing')).toBeNull();
      expect((await repos.machines.list()).map((m) => m.id)).toEqual(['m-press', 'm-row']);

      const rowEx = newExercise({ id: 'ex-row', name: 'Row', nowEpochMs: T0 });
      const pressEx = newExercise({ id: 'ex-press', name: 'Press', nowEpochMs: T0 });
      await repos.exercises.save(rowEx);
      await repos.exercises.save(pressEx);
      expect(await repos.exercises.getById('ex-row')).toEqual(rowEx);
      expect((await repos.exercises.list()).map((e) => e.id)).toEqual(['ex-press', 'ex-row']);

      await repos.exercises.link('ex-row', 'm-row');
      await repos.exercises.link('ex-row', 'm-press');
      await repos.exercises.link('ex-row', 'm-row'); // idempotent
      await repos.exercises.link('ex-press', 'm-press');
      expect((await repos.exercises.machinesFor('ex-row')).map((m) => m.id)).toEqual(['m-press', 'm-row']);
      expect((await repos.exercises.exercisesFor('m-press')).map((e) => e.id)).toEqual(['ex-press', 'ex-row']);
      await repos.exercises.unlink('ex-row', 'm-press');
      expect((await repos.exercises.machinesFor('ex-row')).map((m) => m.id)).toEqual(['m-row']);
      await expect(repos.exercises.link('ex-row', 'missing')).rejects.toThrow();
      await expect(repos.exercises.link('missing', 'm-row')).rejects.toThrow();
    });

    describe('workouts', () => {
      beforeEach(async () => {
        await repos.machines.save(newMachine({ id: 'm-row', name: 'Seated row', motionType: 'rotational', nowEpochMs: T0 }));
        await repos.exercises.save(newExercise({ id: 'ex-row', name: 'Row', nowEpochMs: T0 }));
        await repos.sessions.create({ ...session('rec-1', T0 + 1000), provenance: 'simulated' });
        await repos.sessions.create({ ...session('rec-2', T0 + 900_000), provenance: 'replay' });
        for (const e of [repEvent('rec-1', 3000, 'full'), repEvent('rec-1', 6000, 'partial'), repEvent('rec-1', 9000, 'full')]) {
          await repos.repEvents.append(e);
        }
        await repos.repEvents.append(repEvent('rec-2', 3000, 'full'));
      });

      it('round-trips a whole workout: lifecycle times, pauses, exercises, sets and resistance', async () => {
        const record = finishedWorkout('w1', T0, 'rec-1');
        await repos.workouts.save(record);
        expect(await repos.workouts.getById('w1')).toEqual(record);
        expect(await repos.workouts.getById('missing')).toBeNull();
      });

      it('saving again replaces the stored workout (sets added, a set recorded, the workout paused)', async () => {
        let r = startWorkout(newWorkout('w1', T0), T0);
        r = addExercise(r, { id: 'we1', exerciseId: 'ex-row' });
        r = addSet(r, { id: 's1', workoutExerciseId: 'we1' });
        await repos.workouts.save(r);
        r = beginSetRecording(r, 's1', 'rec-1');
        r = endSetRecording(r, 's1');
        r = addSet(r, { id: 's2', workoutExerciseId: 'we1', resistance: enterResistance(40, 'kg') });
        r = pauseWorkout(r, T0 + 5000);
        await repos.workouts.save(r);
        expect(await repos.workouts.getById('w1')).toEqual(r);
      });

      it('rejects invalid workouts and references to missing exercises, machines or recordings, storing nothing', async () => {
        const valid = finishedWorkout('w1', T0, 'rec-1');
        const twoRecording: WorkoutRecord = {
          ...valid,
          workout: { ...valid.workout, status: 'active', ended_at_epoch_ms: null },
          sets: valid.sets.map((s, i) => ({ ...s, status: 'recording' as const, recording_session_id: `rec-${i + 1}` })),
        };
        await expect(repos.workouts.save(twoRecording)).rejects.toThrow();
        await expect(repos.workouts.save(finishedWorkout('w2', T0, 'missing-recording'))).rejects.toThrow();
        const unknownExercise = { ...valid, exercises: valid.exercises.map((e) => ({ ...e, exercise_id: 'missing' })) };
        await expect(repos.workouts.save(unknownExercise)).rejects.toThrow();
        const unknownMachine = { ...valid, exercises: valid.exercises.map((e) => ({ ...e, machine_id: 'missing' })) };
        await expect(repos.workouts.save(unknownMachine)).rejects.toThrow();
        expect(await repos.workouts.listRecent(10)).toEqual([]);
      });

      it("summarises workouts newest first, with rep counts from the sets' recordings", async () => {
        await repos.workouts.save(finishedWorkout('w1', T0, 'rec-1'));
        await repos.workouts.save(finishedWorkout('w2', T0 + 900_000, 'rec-2'));
        await repos.workouts.save(newWorkout('w3', T0 + 2_000_000));
        const summaries = await repos.workouts.listRecent(10);
        expect(
          summaries.map((s) => [s.workout.id, s.exercise_count, s.set_count, s.completed_set_count, s.full_rep_count, s.partial_rep_count]),
        ).toEqual([
          ['w3', 0, 0, 0, 0, 0],
          ['w2', 1, 2, 1, 1, 0],
          ['w1', 1, 2, 1, 2, 1],
        ]);
        expect(summaries[2]!.workout).toEqual(finishedWorkout('w1', T0, 'rec-1').workout);
        expect(await repos.workouts.listRecent(1)).toHaveLength(1);
      });

      it("lists each set's results with its recording's provenance (planned sets have none)", async () => {
        await repos.workouts.save(finishedWorkout('w1', T0, 'rec-1'));
        const results = await repos.workouts.listSetResults('w1');
        expect(results.map((r) => [r.set.id, r.exercise_id, r.machine_id, r.full_rep_count, r.partial_rep_count, r.provenance])).toEqual([
          ['w1-s1', 'ex-row', 'm-row', 2, 1, 'simulated'],
          ['w1-s2', 'ex-row', 'm-row', 0, 0, null],
        ]);
        expect(results[0]!.set.resistance).toEqual(enterResistance(100, 'lb'));
        expect(await repos.workouts.listSetResults('missing')).toEqual([]);
      });

      it("lists an exercise's recorded sets across workouts, newest first, with the resistance entered", async () => {
        await repos.workouts.save(finishedWorkout('w1', T0, 'rec-1'));
        await repos.workouts.save(finishedWorkout('w2', T0 + 900_000, 'rec-2'));
        const history = await repos.workouts.listExerciseHistory('ex-row', 10);
        expect(history.map((h) => [h.set.id, h.workout_id, h.workout_started_at_epoch_ms, h.full_rep_count, h.provenance])).toEqual([
          ['w2-s1', 'w2', T0 + 900_000, 1, 'replay'],
          ['w1-s1', 'w1', T0, 2, 'simulated'],
        ]);
        expect(history[0]!.resistance).toEqual(enterResistance(100, 'lb'));
        expect(await repos.workouts.listExerciseHistory('ex-row', 1)).toHaveLength(1);
        expect(await repos.workouts.listExerciseHistory('missing', 10)).toEqual([]);
      });

      it('deleting a workout keeps its recordings, raw samples and rep events', async () => {
        await repos.rawSamples.appendBatch('rec-1', labelledSamples().slice(0, 20));
        await repos.workouts.save(finishedWorkout('w1', T0, 'rec-1'));
        await repos.workouts.delete('w1');
        expect(await repos.workouts.getById('w1')).toBeNull();
        expect(await repos.workouts.listSetResults('w1')).toEqual([]);
        expect(await repos.sessions.getById('rec-1')).not.toBeNull();
        expect(await repos.rawSamples.listBySession('rec-1')).toHaveLength(20);
        expect(await repos.repEvents.listBySession('rec-1')).toHaveLength(3);
      });
    });
  });
}

