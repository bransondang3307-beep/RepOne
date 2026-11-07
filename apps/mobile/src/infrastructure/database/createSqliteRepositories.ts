import type { AxisIndex, DataProvenance, RawSensorSample, RepCalibration, RepEvent, SensorErrorCode } from '@repone/sensor-contracts';
import {
  validateWorkoutRecord,
  type Exercise,
  type ExerciseHistoryEntry,
  type Machine,
  type Repositories,
  type Resistance,
  type SessionEndReason,
  type SetResult,
  type Workout,
  type WorkoutExercise,
  type WorkoutRecord,
  type WorkoutSession,
  type WorkoutSessionSummary,
  type WorkoutSet,
  type WorkoutSummary,
} from '@repone/workout-domain';
import type { SqlDatabase } from './SqlDatabase';

interface SessionRow extends Omit<WorkoutSession, 'activity_type'> {
  activity_type: string;
}

interface RawSampleRow {
  timestamp_ms: number;
  source_id: string;
  accel_x_m_s2: number;
  accel_y_m_s2: number;
  accel_z_m_s2: number;
  gyro_x_rad_s: number;
  gyro_y_rad_s: number;
  gyro_z_rad_s: number;
  quality_flags: string;
}

interface RepEventRow {
  session_id: string;
  timestamp_ms: number;
  start_timestamp_ms: number;
  classification: 'full' | 'partial';
  peak_excursion_rad: number;
  calibration_id: string;
  algorithm_version: string;
  quality_flags: string;
}

interface CalibrationRow {
  calibration_id: string;
  axis: number;
  gyro_bias_x_rad_s: number;
  gyro_bias_y_rad_s: number;
  gyro_bias_z_rad_s: number;
  full_rom_rad: number;
  provenance: RepCalibration['provenance'];
  created_at_epoch_ms: number;
}

type WorkoutRow = Omit<Workout, 'pauses'>;

interface SetRow {
  id: string;
  workout_exercise_id: string;
  position: number;
  status: WorkoutSet['status'];
  recording_session_id: string | null;
  resistance_kg: number | null;
  resistance_entered_unit: Resistance['entered_unit'] | null;
  resistance_source: Resistance['source'] | null;
}

interface SetResultRow extends SetRow {
  workout_id: string;
  exercise_id: string;
  machine_id: string | null;
  provenance: DataProvenance | null;
  full_rep_count: number;
  partial_rep_count: number;
  workout_started_at_epoch_ms: number | null;
}

const SESSION_COLUMNS =
  'id, activity_type, provenance, source_id, source_kind, calibration_id, algorithm_version, machine_label, started_at_epoch_ms, ended_at_epoch_ms';
const SET_COLUMNS =
  's.id, s.workout_exercise_id, s.position, s.status, s.recording_session_id, s.resistance_kg, s.resistance_entered_unit, s.resistance_source';
/** A set's rep counts: the rep events of its recording, counted on read (ADR 0003: full count, partial logged). */
const SET_REP_COUNTS = `
  (SELECT COUNT(*) FROM rep_events e WHERE e.session_id = s.recording_session_id AND e.classification = 'full') AS full_rep_count,
  (SELECT COUNT(*) FROM rep_events e WHERE e.session_id = s.recording_session_id AND e.classification = 'partial') AS partial_rep_count`;
const SET_RESULT_SELECT = `
  SELECT ${SET_COLUMNS}, we.workout_id, we.exercise_id, we.machine_id, ws.provenance,
    w.started_at_epoch_ms AS workout_started_at_epoch_ms, ${SET_REP_COUNTS}
  FROM workout_sets s
  JOIN workout_exercises we ON we.id = s.workout_exercise_id
  JOIN workouts w ON w.id = we.workout_id
  LEFT JOIN workout_sessions ws ON ws.id = s.recording_session_id`;

const toSession = (row: SessionRow): WorkoutSession => ({ ...row, activity_type: 'gym' });

const toSet = (r: SetRow): WorkoutSet => ({
  id: r.id,
  workout_exercise_id: r.workout_exercise_id,
  position: r.position,
  status: r.status,
  recording_session_id: r.recording_session_id,
  resistance:
    r.resistance_kg === null || r.resistance_entered_unit === null
      ? null
      : { kg: r.resistance_kg, entered_unit: r.resistance_entered_unit, source: 'user_entered' },
});

const toSetResult = (r: SetResultRow): SetResult => ({
  set: toSet(r),
  workout_id: r.workout_id,
  exercise_id: r.exercise_id,
  machine_id: r.machine_id,
  full_rep_count: Number(r.full_rep_count),
  partial_rep_count: Number(r.partial_rep_count),
  provenance: r.provenance,
});

/**
 * SQLite-backed repositories. Call `migrate(db)` before use.
 *
 * Every write goes through one queue. expo-sqlite transactions are not exclusive, so without it a workout save and a
 * recording's sample writes could interleave inside one transaction (RO-013).
 */
export function createSqliteRepositories(db: SqlDatabase): Repositories {
  let writes: Promise<unknown> = Promise.resolve();
  const write = <T>(work: () => Promise<T>): Promise<T> => {
    const result = writes.then(work);
    writes = result.catch(() => undefined);
    return result;
  };

  const loadPauses = async (workoutId: string) =>
    db.all<{ start_epoch_ms: number; end_epoch_ms: number | null }>(
      'SELECT start_epoch_ms, end_epoch_ms FROM workout_pauses WHERE workout_id = ? ORDER BY position',
      [workoutId],
    );

  const toWorkout = async (row: WorkoutRow): Promise<Workout> => ({
    id: row.id,
    status: row.status,
    created_at_epoch_ms: row.created_at_epoch_ms,
    started_at_epoch_ms: row.started_at_epoch_ms,
    ended_at_epoch_ms: row.ended_at_epoch_ms,
    pauses: await loadPauses(row.id),
  });

  return {
    sessions: {
      create: (s) =>
        write(() =>
          db.run(`INSERT INTO workout_sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            s.id,
            s.activity_type,
            s.provenance,
            s.source_id,
            s.source_kind,
            s.calibration_id,
            s.algorithm_version,
            s.machine_label,
            s.started_at_epoch_ms,
            s.ended_at_epoch_ms,
          ]),
        ),
      markEnded: (sessionId, endedAtEpochMs, outcome) =>
        write(() =>
          outcome
            ? db.run('UPDATE workout_sessions SET ended_at_epoch_ms = ?, end_reason = ?, sensor_error_code = ? WHERE id = ?', [
                endedAtEpochMs,
                outcome.end_reason,
                outcome.sensor_error_code,
                sessionId,
              ])
            : db.run('UPDATE workout_sessions SET ended_at_epoch_ms = ? WHERE id = ?', [endedAtEpochMs, sessionId]),
        ),
      async getOutcome(sessionId) {
        const [row] = await db.all<{ end_reason: SessionEndReason | null; sensor_error_code: SensorErrorCode | null }>(
          'SELECT end_reason, sensor_error_code FROM workout_sessions WHERE id = ?',
          [sessionId],
        );
        return row?.end_reason ? { end_reason: row.end_reason, sensor_error_code: row.sensor_error_code } : null;
      },
      async getById(sessionId) {
        const rows = await db.all<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE id = ?`, [sessionId]);
        return rows[0] ? toSession(rows[0]) : null;
      },
      async listRecent(limit) {
        const rows = await db.all<SessionRow & { full_rep_count: number; partial_rep_count: number }>(
          `SELECT ${SESSION_COLUMNS.split(', ').map((c) => `s.${c}`).join(', ')},
             COALESCE(SUM(e.classification = 'full'), 0) AS full_rep_count,
             COALESCE(SUM(e.classification = 'partial'), 0) AS partial_rep_count
           FROM workout_sessions s
           LEFT JOIN rep_events e ON e.session_id = s.id
           GROUP BY s.id
           ORDER BY s.started_at_epoch_ms DESC
           LIMIT ?`,
          [limit],
        );
        return rows.map((r): WorkoutSessionSummary => ({
          ...toSession(r),
          full_rep_count: Number(r.full_rep_count),
          partial_rep_count: Number(r.partial_rep_count),
        }));
      },
    },

    rawSamples: {
      appendBatch: (sessionId, samples) =>
        write(async () => {
          if (samples.length === 0) return;
          await db.transaction(async () => {
            for (const s of samples) {
              await db.run(
                `INSERT INTO raw_samples (session_id, timestamp_ms, source_id,
                   accel_x_m_s2, accel_y_m_s2, accel_z_m_s2, gyro_x_rad_s, gyro_y_rad_s, gyro_z_rad_s, quality_flags)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  sessionId,
                  s.timestamp_ms,
                  s.source_id,
                  ...s.accel_m_s2,
                  ...s.gyro_rad_s,
                  JSON.stringify(s.quality_flags),
                ],
              );
            }
          });
        }),
      async listBySession(sessionId) {
        const rows = await db.all<RawSampleRow>(
          'SELECT * FROM raw_samples WHERE session_id = ? ORDER BY timestamp_ms, rowid',
          [sessionId],
        );
        return rows.map(
          (r): RawSensorSample => ({
            timestamp_ms: r.timestamp_ms,
            source_id: r.source_id,
            accel_m_s2: [r.accel_x_m_s2, r.accel_y_m_s2, r.accel_z_m_s2],
            gyro_rad_s: [r.gyro_x_rad_s, r.gyro_y_rad_s, r.gyro_z_rad_s],
            quality_flags: JSON.parse(r.quality_flags) as string[],
          }),
        );
      },
    },

    repEvents: {
      append: (e, sourceId = null) =>
        write(() =>
          db.run(
            `INSERT INTO rep_events (session_id, timestamp_ms, start_timestamp_ms, classification, peak_excursion_rad,
               confidence, calibration_id, algorithm_version, provenance, quality_flags, source_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              e.session_id,
              e.timestamp_ms,
              e.start_timestamp_ms,
              e.classification,
              e.peak_excursion_rad,
              e.confidence,
              e.calibration_id,
              e.algorithm_version,
              e.provenance,
              JSON.stringify(e.quality_flags),
              sourceId,
            ],
          ),
        ),
      async listBySession(sessionId) {
        const rows = await db.all<RepEventRow>(
          'SELECT * FROM rep_events WHERE session_id = ? ORDER BY timestamp_ms, rowid',
          [sessionId],
        );
        return rows.map(
          (r): RepEvent => ({
            session_id: r.session_id,
            activity_type: 'gym',
            event_type: 'rep_completed',
            timestamp_ms: r.timestamp_ms,
            value: 1,
            classification: r.classification,
            confidence: null,
            calibration_id: r.calibration_id,
            algorithm_version: r.algorithm_version,
            provenance: 'imu_algorithm',
            start_timestamp_ms: r.start_timestamp_ms,
            peak_excursion_rad: r.peak_excursion_rad,
            quality_flags: JSON.parse(r.quality_flags) as string[],
          }),
        );
      },
      async listSourceIdsBySession(sessionId) {
        const rows = await db.all<{ source_id: string | null }>(
          'SELECT source_id FROM rep_events WHERE session_id = ? ORDER BY timestamp_ms, rowid',
          [sessionId],
        );
        return rows.map((r) => r.source_id);
      },
    },

    calibrations: {
      save: (c) =>
        write(() =>
          db.run(
            `INSERT OR REPLACE INTO calibrations (calibration_id, axis, gyro_bias_x_rad_s, gyro_bias_y_rad_s,
               gyro_bias_z_rad_s, full_rom_rad, provenance, created_at_epoch_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [c.calibration_id, c.axis, ...c.gyro_bias_rad_s, c.full_rom_rad, c.provenance, c.created_at_epoch_ms],
          ),
        ),
      async getById(calibrationId) {
        const rows = await db.all<CalibrationRow>('SELECT * FROM calibrations WHERE calibration_id = ?', [calibrationId]);
        const r = rows[0];
        if (!r) return null;
        return {
          calibration_id: r.calibration_id,
          axis: r.axis as AxisIndex,
          gyro_bias_rad_s: [r.gyro_bias_x_rad_s, r.gyro_bias_y_rad_s, r.gyro_bias_z_rad_s],
          full_rom_rad: r.full_rom_rad,
          provenance: r.provenance,
          created_at_epoch_ms: r.created_at_epoch_ms,
        };
      },
    },

    machines: {
      // Upsert, not INSERT OR REPLACE: a replace deletes the row first, which would cascade to its exercise links.
      save: (m) =>
        write(() =>
          db.run(
            `INSERT INTO machines (id, name, motion_type, notes, created_at_epoch_ms) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name, motion_type = excluded.motion_type,
               notes = excluded.notes, created_at_epoch_ms = excluded.created_at_epoch_ms`,
            [m.id, m.name, m.motion_type, m.notes, m.created_at_epoch_ms],
          ),
        ),
      async getById(machineId) {
        const [row] = await db.all<Machine>('SELECT * FROM machines WHERE id = ?', [machineId]);
        return row ?? null;
      },
      list: () => db.all<Machine>('SELECT * FROM machines ORDER BY name, id'),
    },

    exercises: {
      save: (e) =>
        write(() =>
          db.run(
            `INSERT INTO exercises (id, name, created_at_epoch_ms) VALUES (?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name, created_at_epoch_ms = excluded.created_at_epoch_ms`,
            [e.id, e.name, e.created_at_epoch_ms],
          ),
        ),
      async getById(exerciseId) {
        const [row] = await db.all<Exercise>('SELECT * FROM exercises WHERE id = ?', [exerciseId]);
        return row ?? null;
      },
      list: () => db.all<Exercise>('SELECT * FROM exercises ORDER BY name, id'),
      link: (exerciseId, machineId) =>
        write(() =>
          db.run('INSERT OR IGNORE INTO exercise_machines (exercise_id, machine_id) VALUES (?, ?)', [exerciseId, machineId]),
        ),
      unlink: (exerciseId, machineId) =>
        write(() => db.run('DELETE FROM exercise_machines WHERE exercise_id = ? AND machine_id = ?', [exerciseId, machineId])),
      machinesFor: (exerciseId) =>
        db.all<Machine>(
          `SELECT m.* FROM machines m JOIN exercise_machines l ON l.machine_id = m.id
           WHERE l.exercise_id = ? ORDER BY m.name, m.id`,
          [exerciseId],
        ),
      exercisesFor: (machineId) =>
        db.all<Exercise>(
          `SELECT e.* FROM exercises e JOIN exercise_machines l ON l.exercise_id = e.id
           WHERE l.machine_id = ? ORDER BY e.name, e.id`,
          [machineId],
        ),
    },

    workouts: {
      save: (record) =>
        write(async () => {
          const problems = validateWorkoutRecord(record);
          if (problems.length > 0) throw new Error(`Invalid workout ${record.workout.id}: ${problems.join('; ')}`);
          const w = record.workout;
          await db.transaction(async () => {
            await db.run(
              `INSERT INTO workouts (id, status, created_at_epoch_ms, started_at_epoch_ms, ended_at_epoch_ms)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (id) DO UPDATE SET status = excluded.status, created_at_epoch_ms = excluded.created_at_epoch_ms,
                 started_at_epoch_ms = excluded.started_at_epoch_ms, ended_at_epoch_ms = excluded.ended_at_epoch_ms`,
              [w.id, w.status, w.created_at_epoch_ms, w.started_at_epoch_ms, w.ended_at_epoch_ms],
            );
            // Replace the children; deleting the exercises cascades to their sets.
            await db.run('DELETE FROM workout_pauses WHERE workout_id = ?', [w.id]);
            await db.run('DELETE FROM workout_exercises WHERE workout_id = ?', [w.id]);
            for (const [position, p] of w.pauses.entries()) {
              await db.run('INSERT INTO workout_pauses (workout_id, position, start_epoch_ms, end_epoch_ms) VALUES (?, ?, ?, ?)', [
                w.id,
                position,
                p.start_epoch_ms,
                p.end_epoch_ms,
              ]);
            }
            for (const e of record.exercises) {
              await db.run(
                'INSERT INTO workout_exercises (id, workout_id, exercise_id, machine_id, position) VALUES (?, ?, ?, ?, ?)',
                [e.id, w.id, e.exercise_id, e.machine_id, e.position],
              );
            }
            for (const s of record.sets) {
              await db.run(
                `INSERT INTO workout_sets (id, workout_exercise_id, position, status, recording_session_id,
                   resistance_kg, resistance_entered_unit, resistance_source)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  s.id,
                  s.workout_exercise_id,
                  s.position,
                  s.status,
                  s.recording_session_id,
                  s.resistance?.kg ?? null,
                  s.resistance?.entered_unit ?? null,
                  s.resistance?.source ?? null,
                ],
              );
            }
          });
        }),
      async getById(workoutId) {
        const [row] = await db.all<WorkoutRow>('SELECT * FROM workouts WHERE id = ?', [workoutId]);
        if (!row) return null;
        const exercises = await db.all<WorkoutExercise>(
          'SELECT id, workout_id, exercise_id, machine_id, position FROM workout_exercises WHERE workout_id = ? ORDER BY position',
          [workoutId],
        );
        const sets = await db.all<SetRow>(
          `SELECT ${SET_COLUMNS} FROM workout_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
           WHERE we.workout_id = ? ORDER BY we.position, s.position`,
          [workoutId],
        );
        return { workout: await toWorkout(row), exercises, sets: sets.map(toSet) } satisfies WorkoutRecord;
      },
      async listRecent(limit) {
        const rows = await db.all<
          WorkoutRow & {
            exercise_count: number;
            set_count: number;
            completed_set_count: number;
            full_rep_count: number;
            partial_rep_count: number;
          }
        >(
          `SELECT w.*,
             (SELECT COUNT(*) FROM workout_exercises we WHERE we.workout_id = w.id) AS exercise_count,
             (SELECT COUNT(*) FROM workout_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
               WHERE we.workout_id = w.id) AS set_count,
             (SELECT COUNT(*) FROM workout_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
               WHERE we.workout_id = w.id AND s.status = 'completed') AS completed_set_count,
             (SELECT COUNT(*) FROM rep_events e JOIN workout_sets s ON e.session_id = s.recording_session_id
               JOIN workout_exercises we ON we.id = s.workout_exercise_id
               WHERE we.workout_id = w.id AND e.classification = 'full') AS full_rep_count,
             (SELECT COUNT(*) FROM rep_events e JOIN workout_sets s ON e.session_id = s.recording_session_id
               JOIN workout_exercises we ON we.id = s.workout_exercise_id
               WHERE we.workout_id = w.id AND e.classification = 'partial') AS partial_rep_count
           FROM workouts w
           ORDER BY w.created_at_epoch_ms DESC, w.rowid DESC
           LIMIT ?`,
          [limit],
        );
        const summaries: WorkoutSummary[] = [];
        for (const r of rows) {
          summaries.push({
            workout: await toWorkout(r),
            exercise_count: Number(r.exercise_count),
            set_count: Number(r.set_count),
            completed_set_count: Number(r.completed_set_count),
            full_rep_count: Number(r.full_rep_count),
            partial_rep_count: Number(r.partial_rep_count),
          });
        }
        return summaries;
      },
      async listSetResults(workoutId) {
        const rows = await db.all<SetResultRow>(`${SET_RESULT_SELECT} WHERE we.workout_id = ? ORDER BY we.position, s.position`, [
          workoutId,
        ]);
        return rows.map(toSetResult);
      },
      async listExerciseHistory(exerciseId, limit) {
        const rows = await db.all<SetResultRow>(
          `${SET_RESULT_SELECT}
           WHERE we.exercise_id = ? AND s.status = 'completed'
           ORDER BY w.started_at_epoch_ms IS NULL, w.started_at_epoch_ms DESC, we.position DESC, s.position DESC
           LIMIT ?`,
          [exerciseId, limit],
        );
        return rows.map(
          (r): ExerciseHistoryEntry => ({
            ...toSetResult(r),
            workout_started_at_epoch_ms: r.workout_started_at_epoch_ms,
            resistance: toSet(r).resistance,
          }),
        );
      },
      delete: (workoutId) => write(() => db.run('DELETE FROM workouts WHERE id = ?', [workoutId])),
    },
  };
}
