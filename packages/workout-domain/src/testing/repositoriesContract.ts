import {
  LABELLED_SET_SCRIPT,
  createSyntheticCalibration,
  generateTrace,
  type RepEvent,
} from '@repone/sensor-contracts';
import type { Repositories, WorkoutSession } from '../repositories';

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
  });
}
