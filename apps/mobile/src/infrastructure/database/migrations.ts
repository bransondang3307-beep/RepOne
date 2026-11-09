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
  // v2 — RO-013 / ADR 0010: workouts, exercises, machines, sets, user-entered resistance; recording outcome and the
  // rep-event channel. Additive only: no existing table or column changes, and new columns are nullable (null =
  // not recorded). Deleting a workout never deletes a recording (`ON DELETE SET NULL`).
  `
  CREATE TABLE machines (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    motion_type TEXT NOT NULL CHECK (motion_type IN ('rotational', 'linear', 'unknown')),
    notes TEXT,
    created_at_epoch_ms INTEGER NOT NULL
  );

  CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    created_at_epoch_ms INTEGER NOT NULL
  );

  CREATE TABLE exercise_machines (
    exercise_id TEXT NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
    machine_id TEXT NOT NULL REFERENCES machines (id) ON DELETE CASCADE,
    PRIMARY KEY (exercise_id, machine_id)
  );

  CREATE TABLE workouts (
    id TEXT PRIMARY KEY NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'paused', 'finished')),
    created_at_epoch_ms INTEGER NOT NULL,
    started_at_epoch_ms INTEGER,
    ended_at_epoch_ms INTEGER
  );
  CREATE INDEX idx_workouts_created ON workouts (created_at_epoch_ms DESC);

  CREATE TABLE workout_pauses (
    workout_id TEXT NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    start_epoch_ms INTEGER NOT NULL,
    end_epoch_ms INTEGER,
    PRIMARY KEY (workout_id, position)
  );

  CREATE TABLE workout_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    workout_id TEXT NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises (id),
    machine_id TEXT REFERENCES machines (id),
    position INTEGER NOT NULL,
    UNIQUE (workout_id, position)
  );

  CREATE TABLE workout_sets (
    id TEXT PRIMARY KEY NOT NULL,
    workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('planned', 'recording', 'completed')),
    recording_session_id TEXT REFERENCES workout_sessions (id) ON DELETE SET NULL,
    resistance_kg REAL CHECK (resistance_kg > 0),
    resistance_entered_unit TEXT CHECK (resistance_entered_unit IN ('kg', 'lb')),
    resistance_source TEXT CHECK (resistance_source IN ('user_entered')),
    CHECK ((resistance_kg IS NULL) = (resistance_entered_unit IS NULL)),
    CHECK ((resistance_kg IS NULL) = (resistance_source IS NULL)),
    UNIQUE (workout_exercise_id, position)
  );
  CREATE INDEX idx_workout_sets_recording ON workout_sets (recording_session_id);

  ALTER TABLE workout_sessions ADD COLUMN end_reason TEXT
    CHECK (end_reason IN ('stopped', 'stream_ended', 'sensor_error', 'start_failed', 'write_failed'));
  ALTER TABLE workout_sessions ADD COLUMN sensor_error_code TEXT;
  ALTER TABLE rep_events ADD COLUMN source_id TEXT;
  `,
];

/**
 * Apply pending migrations, tracked via PRAGMA user_version, each in its own transaction (a failure leaves the
 * database at the previous version, and the next launch retries). Returns the resulting version. `migrations` is
 * for tests only (e.g. an app that knows fewer versions).
 */
export async function migrate(db: SqlDatabase, migrations: readonly string[] = MIGRATIONS): Promise<number> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;
  if (version > migrations.length) {
    throw new Error(`Database schema v${version} is newer than this app supports (v${migrations.length})`);
  }
  while (version < migrations.length) {
    const next = version + 1;
    await db.transaction(async () => {
      await db.exec(migrations[version]!);
      await db.exec(`PRAGMA user_version = ${next};`);
    });
    version = next;
  }
  return version;
}
