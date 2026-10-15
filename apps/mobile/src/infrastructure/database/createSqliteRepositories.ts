import type { AxisIndex, RawSensorSample, RepCalibration, RepEvent } from '@repone/sensor-contracts';
import type { Repositories, WorkoutSession, WorkoutSessionSummary } from '@repone/workout-domain';
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

const SESSION_COLUMNS =
  'id, activity_type, provenance, source_id, source_kind, calibration_id, algorithm_version, machine_label, started_at_epoch_ms, ended_at_epoch_ms';

const toSession = (row: SessionRow): WorkoutSession => ({ ...row, activity_type: 'gym' });

/** SQLite-backed repositories. Call `migrate(db)` before use. */
export function createSqliteRepositories(db: SqlDatabase): Repositories {
  return {
    sessions: {
      async create(s) {
        await db.run(`INSERT INTO workout_sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
        ]);
      },
      async markEnded(sessionId, endedAtEpochMs) {
        await db.run('UPDATE workout_sessions SET ended_at_epoch_ms = ? WHERE id = ?', [endedAtEpochMs, sessionId]);
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
      async appendBatch(sessionId, samples) {
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
      },
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
      async append(e) {
        await db.run(
          `INSERT INTO rep_events (session_id, timestamp_ms, start_timestamp_ms, classification, peak_excursion_rad,
             confidence, calibration_id, algorithm_version, provenance, quality_flags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          ],
        );
      },
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
    },

    calibrations: {
      async save(c) {
        await db.run(
          `INSERT OR REPLACE INTO calibrations (calibration_id, axis, gyro_bias_x_rad_s, gyro_bias_y_rad_s,
             gyro_bias_z_rad_s, full_rom_rad, provenance, created_at_epoch_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.calibration_id, c.axis, ...c.gyro_bias_rad_s, c.full_rom_rad, c.provenance, c.created_at_epoch_ms],
        );
      },
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
  };
}
