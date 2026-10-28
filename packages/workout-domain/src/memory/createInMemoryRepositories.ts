import type { RawSensorSample, RepCalibration, RepEvent } from '@repone/sensor-contracts';
import type { Repositories, WorkoutSession } from '../repositories';

/** Non-persistent repositories for tests and previews. Same contract as SQLite. */
export function createInMemoryRepositories(): Repositories {
  const sessions = new Map<string, WorkoutSession>();
  const samples = new Map<string, RawSensorSample[]>();
  const events = new Map<string, RepEvent[]>();
  const calibrations = new Map<string, RepCalibration>();

  return {
    sessions: {
      async create(session) {
        if (sessions.has(session.id)) throw new Error(`Session ${session.id} already exists`);
        sessions.set(session.id, session);
      },
      async markEnded(sessionId, endedAtEpochMs) {
        const session = sessions.get(sessionId);
        if (!session) throw new Error(`Unknown session ${sessionId}`);
        sessions.set(sessionId, { ...session, ended_at_epoch_ms: endedAtEpochMs });
      },
      async getById(sessionId) {
        return sessions.get(sessionId) ?? null;
      },
      async listRecent(limit) {
        return [...sessions.values()]
          .sort((a, b) => b.started_at_epoch_ms - a.started_at_epoch_ms)
          .slice(0, limit)
          .map((s) => {
            const list = events.get(s.id) ?? [];
            return {
              ...s,
              full_rep_count: list.filter((e) => e.classification === 'full').length,
              partial_rep_count: list.filter((e) => e.classification === 'partial').length,
            };
          });
      },
    },
    rawSamples: {
      async appendBatch(sessionId, batch) {
        samples.set(sessionId, [...(samples.get(sessionId) ?? []), ...batch]);
      },
      async listBySession(sessionId) {
        return [...(samples.get(sessionId) ?? [])];
      },
    },
    repEvents: {
      async append(event) {
        events.set(event.session_id, [...(events.get(event.session_id) ?? []), event]);
      },
      async listBySession(sessionId) {
        return [...(events.get(sessionId) ?? [])];
      },
    },
    calibrations: {
      async save(calibration) {
        calibrations.set(calibration.calibration_id, calibration);
      },
      async getById(calibrationId) {
        return calibrations.get(calibrationId) ?? null;
      },
    },
  };
}
