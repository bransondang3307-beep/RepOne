import {
  DEMO_LOOP_SCRIPT,
  ReplaySensorSource,
  RotationalRepDetector,
  SimulatedSensorSource,
  WorkoutSessionController,
  createInMemoryRepositories,
  createSqliteRepositories,
  createSyntheticCalibration,
  migrate,
  type Repositories,
  type SessionSnapshot,
} from '../src';
import { BASE_SIMULATION, labelledSetTrace } from './helpers/fixtures';
import { ManualScheduler } from './helpers/ManualScheduler';
import { openNodeSqliteDatabase } from './helpers/nodeSqliteDatabase';

function createController(repositories: Repositories = createInMemoryRepositories()) {
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

/** Wait until the controller reaches a terminal status. */
const settled = (controller: WorkoutSessionController) =>
  new Promise<SessionSnapshot>((resolve) => {
    const check = (s: SessionSnapshot) => (s.status === 'finished' || s.status === 'error') && resolve(s);
    check(controller.getSnapshot());
    controller.subscribe(check);
  });

describe('WorkoutSessionController', () => {
  it('records a replayed set end-to-end: raw samples, rep events, ended session', async () => {
    const { controller, repositories } = createController();
    const trace = labelledSetTrace();
    const sensor = new ReplaySensorSource({ id: 'replay-1', samples: trace.samples, provenance: 'simulated' });

    const sessionId = await controller.start({ sensor, calibration, machineLabel: 'Test rig' });
    const final = await settled(controller);

    expect(final).toMatchObject({ status: 'finished', fullReps: 8, partialReps: 2, provenance: 'simulated' });
    expect(await repositories.rawSamples.listBySession(sessionId)).toEqual(trace.samples);
    expect(await repositories.repEvents.listBySession(sessionId)).toHaveLength(10);
    const stored = await repositories.sessions.getById(sessionId);
    expect(stored).toMatchObject({ provenance: 'simulated', machine_label: 'Test rig', source_kind: 'replay' });
    expect(stored!.ended_at_epoch_ms).not.toBeNull();
  });

  it('records a live simulated session against SQLite and stops on demand', async () => {
    const db = openNodeSqliteDatabase();
    await migrate(db);
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
    db.close();
  });

  it('rejects a second concurrent session', async () => {
    const { controller } = createController();
    const sensor = new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: BASE_SIMULATION, scheduler: new ManualScheduler() });
    await controller.start({ sensor, calibration });
    await expect(controller.start({ sensor, calibration })).rejects.toThrow(/already in progress/);
    await controller.stop();
  });

  it('surfaces persistence failures as an error status instead of failing silently', async () => {
    const repositories = createInMemoryRepositories();
    repositories.rawSamples.appendBatch = async () => {
      throw new Error('disk full');
    };
    const { controller } = createController(repositories);
    const sensor = new ReplaySensorSource({ id: 'replay-1', samples: labelledSetTrace().samples });
    await controller.start({ sensor, calibration });
    const final = await settled(controller);
    expect(final).toMatchObject({ status: 'error', error: 'disk full' });
  });

  it('can be reset to idle after finishing', async () => {
    const { controller } = createController();
    await controller.start({ sensor: new ReplaySensorSource({ id: 'r', samples: [] }), calibration });
    await settled(controller);
    controller.reset();
    expect(controller.getSnapshot().status).toBe('idle');
  });
});
