/// <reference types="node" />
// Migration v2 on a FILE-backed database that is closed and reopened, as the app does across launches: expo-sqlite
// opens repone.db at every start and migrates it. This is the software half of RO-013 plan §5 criterion 9. Node's
// SQLite stands in for expo-sqlite behind the same SqlDatabase port; the native iPhone upgrade remains the owner's
// device check. All data is SYNTHETIC: the v1 fixture's simulated recordings and the labelled synthetic trace.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RotationalRepDetector } from '@repone/rep-engine';
import {
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  createSyntheticCalibration,
  generateTrace,
  type SimulationOptions,
} from '@repone/sensor-contracts';
import type { WorkoutSessionSummary } from '@repone/workout-domain';
import { WorkoutSessionController, type SessionSnapshot } from '../../../application/services/WorkoutSessionController';
import { createSqliteRepositories } from '../createSqliteRepositories';
import { MIGRATIONS, migrate } from '../migrations';
import { seedV1History } from './fixtures/v1History';
import { openNodeSqliteDatabase } from './nodeSqliteDatabase';

const V1 = MIGRATIONS.slice(0, 1);
// The same labelled set as WorkoutSessionController.sqlite.test.ts (PR #36): 8 full + 2 partial reps, synthetic.
const SIMULATION: SimulationOptions = { sourceId: 'sim-test-01', sampleRateHz: 50, seed: 42, gyroNoiseRadS: 0.02, accelNoiseMS2: 0.05 };
const calibration = createSyntheticCalibration(0);

const row = (s: WorkoutSessionSummary) => [s.id, s.machine_label, s.provenance, s.full_rep_count, s.partial_rep_count];

const settled = (controller: WorkoutSessionController) =>
  new Promise<SessionSnapshot>((resolve) => {
    const check = (s: SessionSnapshot) => (s.status === 'finished' || s.status === 'error') && resolve(s);
    check(controller.getSnapshot());
    controller.subscribe(check);
  });

describe('migration v2 on a file-backed database across app launches (plan §5 criterion 9, software half)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repone-upgrade-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps v1 standalone history through the upgrade and two reopens, and stores a new simulated recording beside it', async () => {
    const file = join(dir, 'repone.db');

    // Launch 1, an install from before Milestone 3: schema v1 holding standalone recordings.
    const v1 = openNodeSqliteDatabase(file);
    expect(await migrate(v1, V1)).toBe(1);
    await seedV1History(v1);
    const before = await createSqliteRepositories(v1).sessions.listRecent(10);
    expect(before.map(row)).toEqual([
      ['rec-2', 'Seated row (test rig)', 'simulated', 0, 0],
      ['rec-1', 'Seated row (test rig)', 'simulated', 2, 1],
    ]);
    v1.close();

    // Launch 2, the upgraded app: it migrates on open, the history reads the same, then one new simulated set is
    // recorded through the normal path (recording controller → SQLite repositories).
    const upgraded = openNodeSqliteDatabase(file);
    expect(await migrate(upgraded)).toBe(2);
    const repositories = createSqliteRepositories(upgraded);
    expect(await repositories.sessions.listRecent(10)).toEqual(before);
    let now = 1_700_000_200_000;
    const controller = new WorkoutSessionController({
      repositories,
      clock: { now: () => (now += 1000) },
      createId: () => 'rec-new',
      createDetector: (sessionId, cal) => new RotationalRepDetector(sessionId, cal),
    });
    const sensor = new ReplaySensorSource({
      id: 'replay-upgrade',
      samples: generateTrace(LABELLED_SET_SCRIPT, SIMULATION, 'labelled set, low noise').samples,
      provenance: 'simulated',
    });
    const id = await controller.start({ sensor, calibration, machineLabel: 'Lat pulldown' });
    expect(await settled(controller)).toMatchObject({ status: 'finished', fullReps: 8, partialReps: 2, provenance: 'simulated' });
    upgraded.close();

    // Launch 3: reopen. Nothing is left to migrate, and the old and new entries both read back from the file.
    const reopened = openNodeSqliteDatabase(file);
    expect(await reopened.all('PRAGMA user_version')).toEqual([{ user_version: 2 }]);
    expect(await migrate(reopened)).toBe(2);
    const after = createSqliteRepositories(reopened);
    const history = await after.sessions.listRecent(10);
    expect(history.map(row)).toEqual([[id, 'Lat pulldown', 'simulated', 8, 2], ...before.map(row)]);
    expect(history.slice(1)).toEqual(before);
    expect(await after.sessions.getOutcome(id)).toEqual({ end_reason: 'stream_ended', sensor_error_code: null });
    expect(await after.sessions.getOutcome('rec-1')).toBeNull(); // recorded before RO-013: unknown, not "stopped"
    expect(new Set(await after.repEvents.listSourceIdsBySession(id))).toEqual(new Set(['replay-upgrade']));
    expect(await after.repEvents.listSourceIdsBySession('rec-1')).toEqual([null, null, null]);
    expect(await reopened.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(await reopened.all('PRAGMA foreign_key_check')).toEqual([]);
    reopened.close();
  });
});
