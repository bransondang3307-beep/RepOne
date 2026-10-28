import { createSyntheticCalibration } from '@repone/sensor-contracts';
import type { WorkoutSession } from '@repone/workout-domain';
import { describeRepositoriesContract } from '@repone/workout-domain/testing';
import { createSqliteRepositories } from '../createSqliteRepositories';
import { MIGRATIONS, migrate } from '../migrations';
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
