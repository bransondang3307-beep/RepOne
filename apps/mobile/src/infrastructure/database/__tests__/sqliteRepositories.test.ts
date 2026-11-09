import { createSyntheticCalibration } from '@repone/sensor-contracts';
import { addExercise, addSet, newExercise, newWorkout, startWorkout, type WorkoutSession } from '@repone/workout-domain';
import { describeRepositoriesContract } from '@repone/workout-domain/testing';
import { createSqliteRepositories } from '../createSqliteRepositories';
import { MIGRATIONS, migrate } from '../migrations';
import type { SqlDatabase } from '../SqlDatabase';
import { openNodeSqliteDatabase } from './nodeSqliteDatabase';

describeRepositoriesContract('sqlite (node:sqlite)', async () => {
  const db = openNodeSqliteDatabase();
  await migrate(db);
  return createSqliteRepositories(db);
});

describe('SQLite migrations', () => {
  it('migrates a fresh database to the latest version and is idempotent', async () => {
    const db = openNodeSqliteDatabase();
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    db.close();
  });

  it('refuses to open a database from a newer app version', async () => {
    const db = openNodeSqliteDatabase();
    await db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1};`);
    await expect(migrate(db)).rejects.toThrow(/newer/);
    db.close();
  });

  it('enforces provenance values at the schema level', async () => {
    const db = openNodeSqliteDatabase();
    await migrate(db);
    const repos = createSqliteRepositories(db);
    const calibration = createSyntheticCalibration(0);
    await repos.calibrations.save(calibration);
    const session: WorkoutSession = {
      id: 'x',
      activity_type: 'gym',
      provenance: 'made-up' as WorkoutSession['provenance'],
      source_id: 'sim-01',
      source_kind: 'simulated',
      calibration_id: calibration.calibration_id,
      algorithm_version: 'test-0.1',
      machine_label: null,
      started_at_epoch_ms: 1,
      ended_at_epoch_ms: null,
    };
    await expect(repos.sessions.create(session)).rejects.toThrow();
    db.close();
  });
});

// Codex P1 on PR #35 at 08b4b93: a read on the same connection during save() saw the children deleted but not yet
// re-inserted. Every repository operation, reads included, now runs on one queue.
describe('SQLite workouts: reads never observe a save in progress', () => {
  it('reads issued while a save is between deleting and re-inserting children wait for the whole save', async () => {
    const node = openNodeSqliteDatabase();
    await migrate(node);
    // Pause the save right after it deleted the old children, as an async driver can.
    let pause: { reached: () => void; release: Promise<void> } | null = null;
    const db: SqlDatabase = {
      ...node,
      async run(sql, params) {
        if (pause && sql.startsWith('INSERT INTO workout_exercises')) {
          const { reached, release } = pause;
          pause = null;
          reached();
          await release;
        }
        return node.run(sql, params);
      },
    };
    const repos = createSqliteRepositories(db);
    await repos.exercises.save(newExercise({ id: 'ex-row', name: 'Row', nowEpochMs: 1 }));
    let record = startWorkout(newWorkout('w1', 1), 2);
    record = addExercise(record, { id: 'we1', exerciseId: 'ex-row' });
    record = addSet(record, { id: 's1', workoutExerciseId: 'we1' });
    await repos.workouts.save(record);

    let release!: () => void;
    const reached = new Promise<void>((resolve) => {
      pause = { reached: resolve, release: new Promise<void>((r) => (release = r)) };
    });
    const saving = repos.workouts.save(record);
    await reached; // the old exercise and set are deleted; the new ones are not inserted yet
    const reads = Promise.all([repos.workouts.getById('w1'), repos.workouts.listSetResults('w1'), repos.workouts.listRecent(1)]);
    release();
    await saving;
    const [read, results, recent] = await reads;
    expect(read).toEqual(record);
    expect(results.map((r) => r.set.id)).toEqual(['s1']);
    expect(recent[0]).toMatchObject({ exercise_count: 1, set_count: 1 });
    node.close();
  });
});
