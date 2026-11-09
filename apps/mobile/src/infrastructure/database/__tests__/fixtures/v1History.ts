/// <reference types="node" />
// Test fixture (SYNTHETIC data): what an install from before Milestone 3 holds in its schema-v1 database. That is one
// synthetic calibration and two simulated standalone recordings, labelled "Seated row (test rig)". rec-1 has 25 raw
// samples and three rep events (2 full, 1 partial); rec-2 was never ended and has no reps. Shared by the migration
// tests (in-memory and file-backed), so both upgrade the same history.
import type { SqlDatabase } from '../../SqlDatabase';

/** Insert the v1 history rows into a database already migrated to schema v1. */
export async function seedV1History(db: SqlDatabase): Promise<void> {
  await db.run(
    `INSERT INTO calibrations VALUES ('cal-1', 0, 0.001, -0.002, 0.0005, 1.2217, 'synthetic', 1700000000000)`,
  );
  for (const [id, start, end] of [
    ['rec-1', 1700000001000, 1700000060000],
    ['rec-2', 1700000100000, null],
  ] as const) {
    await db.run(
      `INSERT INTO workout_sessions VALUES (?, 'gym', 'simulated', 'simulated-imu-01', 'simulated', 'cal-1',
         'rotational-rep-fsm-0.1.0', 'Seated row (test rig)', ?, ?)`,
      [id, start, end],
    );
  }
  for (let i = 0; i < 25; i++) {
    await db.run(`INSERT INTO raw_samples VALUES ('rec-1', ?, 'simulated-imu-01', 0.01, 0.02, 9.81, ?, 0, 0, '["synthetic"]')`, [
      i * 20,
      0.1 * i,
    ]);
  }
  for (const [t, cls] of [
    [3000, 'full'],
    [6000, 'partial'],
    [9000, 'full'],
  ] as const) {
    await db.run(
      `INSERT INTO rep_events VALUES ('rec-1', ?, ?, ?, 1.1, NULL, 'cal-1', 'rotational-rep-fsm-0.1.0', 'imu_algorithm', '["synthetic"]')`,
      [t, t - 1500, cls],
    );
  }
}
