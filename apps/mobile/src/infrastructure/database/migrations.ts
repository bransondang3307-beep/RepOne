import type { SqlDatabase } from './SqlDatabase';

/**
 * Ordered, append-only schema migrations. Never edit a shipped migration —
 * add a new one. Units are encoded in column names.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE calibrations (
    calibration_id TEXT PRIMARY KEY NOT NULL,
    axis INTEGER NOT NULL CHECK (axis IN (0, 1, 2)),
    gyro_bias_x_rad_s REAL NOT NULL,
    gyro_bias_y_rad_s REAL NOT NULL,
    gyro_bias_z_rad_s REAL NOT NULL,
    full_rom_rad REAL NOT NULL,
    provenance TEXT NOT NULL,
    created_at_epoch_ms INTEGER NOT NULL
  );

  CREATE TABLE workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    activity_type TEXT NOT NULL,
    provenance TEXT NOT NULL CHECK (provenance IN ('simulated', 'replay', 'sensor')),
    source_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    calibration_id TEXT NOT NULL REFERENCES calibrations (calibration_id),
    algorithm_version TEXT NOT NULL,
    machine_label TEXT,
    started_at_epoch_ms INTEGER NOT NULL,
    ended_at_epoch_ms INTEGER
  );
  CREATE INDEX idx_workout_sessions_started ON workout_sessions (started_at_epoch_ms DESC);

  CREATE TABLE raw_samples (
    session_id TEXT NOT NULL REFERENCES workout_sessions (id) ON DELETE CASCADE,
    timestamp_ms INTEGER NOT NULL,
    source_id TEXT NOT NULL,
    accel_x_m_s2 REAL NOT NULL,
    accel_y_m_s2 REAL NOT NULL,
    accel_z_m_s2 REAL NOT NULL,
    gyro_x_rad_s REAL NOT NULL,
    gyro_y_rad_s REAL NOT NULL,
    gyro_z_rad_s REAL NOT NULL,
    quality_flags TEXT NOT NULL
  );
  CREATE INDEX idx_raw_samples_session ON raw_samples (session_id, timestamp_ms);

  CREATE TABLE rep_events (
    session_id TEXT NOT NULL REFERENCES workout_sessions (id) ON DELETE CASCADE,
    timestamp_ms INTEGER NOT NULL,
    start_timestamp_ms INTEGER NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('full', 'partial')),
    peak_excursion_rad REAL NOT NULL,
    confidence REAL,
    calibration_id TEXT NOT NULL,
    algorithm_version TEXT NOT NULL,
    provenance TEXT NOT NULL,
    quality_flags TEXT NOT NULL
  );
  CREATE INDEX idx_rep_events_session ON rep_events (session_id, timestamp_ms);
  `,
];

/** Apply pending migrations, tracked via PRAGMA user_version. Returns the resulting version. */
export async function migrate(db: SqlDatabase): Promise<number> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;
  if (version > MIGRATIONS.length) {
    throw new Error(`Database schema v${version} is newer than this app supports (v${MIGRATIONS.length})`);
  }
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    await db.transaction(async () => {
      await db.exec(MIGRATIONS[version]!);
      await db.exec(`PRAGMA user_version = ${next};`);
    });
    version = next;
  }
  return version;
}
