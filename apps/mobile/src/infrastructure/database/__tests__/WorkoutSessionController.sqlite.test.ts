// Integration tests: WorkoutSessionController (application service) writing through the real
// SQLite repositories (node:sqlite behind the same SqlDatabase port as expo-sqlite).
// Lives under infrastructure/ so the service and its unit tests stay platform-independent.
// RO-006 finding 2 (Codex): restores the controller → SQLite coverage that the Milestone 1
// restructure had replaced with an in-memory test.
import { RotationalRepDetector } from '@repone/rep-engine';
import {
  DEMO_LOOP_SCRIPT,
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SimulatedSensorSource,
  createSyntheticCalibration,
  generateTrace,
  type SimulationOptions,
} from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import type { Repositories } from '@repone/workout-domain';
import { WorkoutSessionController, type SessionSnapshot } from '../../../application/services/WorkoutSessionController';
import { createSqliteRepositories } from '../createSqliteRepositories';
import { migrate } from '../migrations';
import { openNodeSqliteDatabase } from './nodeSqliteDatabase';

// Same fixture as the original packages/core test helpers (main @ d9a7274).
const BASE_SIMULATION: SimulationOptions = {
  sourceId: 'sim-test-01',
  sampleRateHz: 50,
  seed: 42,
  gyroNoiseRadS: 0.02,
  accelNoiseMS2: 0.05,
};
const labelledSetTrace = () => generateTrace(LABELLED_SET_SCRIPT, BASE_SIMULATION, 'labelled set, low noise');

function createController(repositories: Repositories) {
  let n = 0;
  let now = 1_700_000_000_000;
  const controller = new WorkoutSessionController({
    repositories,
    clock: { now: () => (now += 1000) },
    createId: () => `session-${++n}`,
    createDetector: (sessionId, calibration) => new RotationalRepDetector(sessionId, calibration),
  });
  return { controller, repositories };
}

const calibration = createSyntheticCalibration(0);

const settled = (controller: WorkoutSessionController) =>
  new Promise<SessionSnapshot>((resolve) => {
    const check = (s: SessionSnapshot) => (s.status === 'finished' || s.status === 'error') && resolve(s);
    check(controller.getSnapshot());
    controller.subscribe(check);
  });

describe('WorkoutSessionController × SQLite (integration)', () => {
  let db: ReturnType<typeof openNodeSqliteDatabase>;

  beforeEach(async () => {
    db = openNodeSqliteDatabase();
    await migrate(db);
  });

  afterEach(() => db.close());

  // Restored verbatim from packages/core/test/workoutSessionController.test.ts (main @ d9a7274).
  it('records a live simulated session against SQLite and stops on demand', async () => {
    const { controller, repositories } = createController(createSqliteRepositories(db));
    const scheduler = new ManualScheduler();
    const sensor = new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: BASE_SIMULATION, scheduler });

    const sessionId = await controller.start({ sensor, calibration });
    expect(controller.getSnapshot().status).toBe('recording');
    scheduler.advance(30_000);
    await controller.stop();

    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('finished');
    expect(snapshot.samplesReceived).toBe(1500);
    expect(snapshot.fullReps).toBeGreaterThan(0);
    expect(scheduler.activeTimers).toBe(0);
    expect(await repositories.rawSamples.listBySession(sessionId)).toHaveLength(1500);
    const [summary] = await repositories.sessions.listRecent(1);
    expect(summary).toMatchObject({ id: sessionId, full_rep_count: snapshot.fullReps, partial_rep_count: snapshot.partialReps });
  });

  it('persists a replayed labelled set through SQLite in order: raw samples, rep events, ended session', async () => {
    const { controller, repositories } = createController(createSqliteRepositories(db));
    const trace = labelledSetTrace();
    const sensor = new ReplaySensorSource({ id: 'replay-1', samples: trace.samples, provenance: 'simulated' });

    const sessionId = await controller.start({ sensor, calibration, machineLabel: 'Test rig' });
    const final = await settled(controller);

    // Synthetic labelled set: 8 full + 2 partial reps (simulated data, not a real measurement).
    expect(final).toMatchObject({ status: 'finished', fullReps: 8, partialReps: 2, provenance: 'simulated', error: null });

    // Batched raw-sample writes land complete and in sample order (non-multiple-of-batch tail included).
    expect(trace.samples.length % 50).not.toBe(0);
    expect(await repositories.rawSamples.listBySession(sessionId)).toEqual(trace.samples);

    // Every emitted rep event is persisted, in order, with the snapshot's last event as the final row.
    const events = await repositories.repEvents.listBySession(sessionId);
    expect(events).toHaveLength(10);
    expect(events.map((e) => e.classification).filter((c) => c === 'full')).toHaveLength(8);
    expect(events.map((e) => e.timestamp_ms)).toEqual([...events.map((e) => e.timestamp_ms)].sort((a, b) => a - b));
    expect(events.at(-1)).toEqual(final.lastEvent);

    const stored = await repositories.sessions.getById(sessionId);
    expect(stored).toMatchObject({ provenance: 'simulated', machine_label: 'Test rig', source_kind: 'replay' });
    expect(stored!.ended_at_epoch_ms).not.toBeNull();
    const [summary] = await repositories.sessions.listRecent(1);
    expect(summary).toMatchObject({ id: sessionId, full_rep_count: 8, partial_rep_count: 2 });
  });
});
