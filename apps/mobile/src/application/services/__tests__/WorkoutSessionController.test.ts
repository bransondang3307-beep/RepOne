import { RotationalRepDetector } from '@repone/rep-engine';
import {
  BaseSensorSource,
  DEMO_LOOP_SCRIPT,
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SensorStartError,
  SimulatedSensorSource,
  createSyntheticCalibration,
  generateTrace,
  type SensorError,
  type SimulatedFault,
  type SimulationOptions,
} from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createInMemoryRepositories, type Repositories } from '@repone/workout-domain';
import { WorkoutSessionController, type SessionSnapshot } from '../WorkoutSessionController';

const BASE_SIMULATION: SimulationOptions = { sourceId: 'sim-test-01', sampleRateHz: 50, seed: 42, gyroNoiseRadS: 0.02 };
const labelledSetTrace = () => generateTrace(LABELLED_SET_SCRIPT, BASE_SIMULATION);

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

function faultySensor(fault: SimulatedFault, script = LABELLED_SET_SCRIPT) {
  const scheduler = new ManualScheduler();
  return { scheduler, sensor: new SimulatedSensorSource({ script, simulation: BASE_SIMULATION, scheduler, fault }) };
}

/** A non-conforming source whose start() rejects without reporting `error` first. */
class RejectingSensor extends BaseSensorSource {
  constructor() {
    super('rejecting-01', 'usb_serial', 'sensor');
  }
  async start(): Promise<void> {
    throw new Error('port not found');
  }
  async stop(): Promise<void> {}
}

/** A source whose start() stays pending until the test settles it (models a slow port open). */
class DeferredStartSensor extends BaseSensorSource {
  private settle: { resolve: () => void; reject: (e: unknown) => void } | null = null;
  constructor() {
    super('deferred-01', 'usb_serial', 'sensor');
  }
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.settle = { resolve, reject };
    });
  }
  stopCalls = 0;
  async stop(): Promise<void> {
    this.stopCalls += 1;
  }
  resolveStart(): void {
    this.setStatus('streaming');
    this.settle!.resolve();
  }
  rejectStart(error: SensorError): void {
    this.fail(error);
    this.settle!.reject(new SensorStartError(error));
  }
}

/** Let pending promise chains (in-memory repository calls, the write queue) run. */
const flush = async (rounds = 5) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
};

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

  it('records a live simulated session and stops on demand', async () => {
    const { controller, repositories } = createController();
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

  it('ends in error with the sensor\'s reason when the sensor fails mid-set, keeping what was recorded', async () => {
    const { controller, repositories } = createController();
    const { scheduler, sensor } = faultySensor({ afterSamples: 120, code: 'connection_lost' });

    const sessionId = await controller.start({ sensor, calibration });
    scheduler.advance(5000);
    const final = await settled(controller);

    expect(final).toMatchObject({
      status: 'error',
      samplesReceived: 120,
      sensorError: { code: 'connection_lost', message: 'Simulated fault: connection_lost' },
    });
    expect(final.error).toBe(
      'The sensor connection was lost (Simulated fault: connection_lost). The 120 samples received before the failure were saved.',
    );
    expect(await repositories.rawSamples.listBySession(sessionId)).toEqual(labelledSetTrace().samples.slice(0, 120));
    expect((await repositories.sessions.getById(sessionId))!.ended_at_epoch_ms).not.toBeNull();
    expect(scheduler.activeTimers).toBe(0);

    controller.reset();
    const next = faultySensor({ afterSamples: 10_000, code: 'unknown' });
    await controller.start({ sensor: next.sensor, calibration });
    expect(controller.getSnapshot()).toMatchObject({ status: 'recording', sensorError: null, error: null });
    await controller.stop();
  });

  it('ends in error and rethrows when the sensor cannot start', async () => {
    const { controller, repositories } = createController();
    const { sensor } = faultySensor({ afterSamples: 0, code: 'start_failed', message: 'Port busy' });

    await expect(controller.start({ sensor, calibration })).rejects.toBeInstanceOf(SensorStartError);

    const snapshot = controller.getSnapshot();
    expect(snapshot).toMatchObject({ status: 'error', sensorError: { code: 'start_failed', message: 'Port busy' } });
    expect(snapshot.error).toBe('The sensor could not start (Port busy). No samples were recorded.');
    expect((await repositories.sessions.getById(snapshot.sessionId!))!.ended_at_epoch_ms).not.toBeNull();
    controller.reset();
    expect(controller.getSnapshot().status).toBe('idle');
  });

  it('ends the session when a source rejects start() without reporting an error', async () => {
    const { controller, repositories } = createController();

    await expect(controller.start({ sensor: new RejectingSensor(), calibration })).rejects.toThrow('port not found');

    const snapshot = controller.getSnapshot();
    expect(snapshot).toMatchObject({ status: 'error', sensorError: { code: 'start_failed', message: 'port not found' } });
    expect((await repositories.sessions.getById(snapshot.sessionId!))!.ended_at_epoch_ms).not.toBeNull();
    controller.reset();
    const { sensor } = faultySensor({ afterSamples: 10_000, code: 'unknown' });
    await controller.start({ sensor, calibration });
    expect(controller.getSnapshot().status).toBe('recording');
    await controller.stop();
  });

  it('stops a live recording whose writes fail instead of collecting unsaved samples', async () => {
    const repositories = createInMemoryRepositories();
    repositories.rawSamples.appendBatch = async () => {
      throw new Error('disk full');
    };
    const { controller } = createController(repositories);
    const scheduler = new ManualScheduler();
    const sensor = new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: BASE_SIMULATION, scheduler });

    await controller.start({ sensor, calibration });
    scheduler.advance(2000);
    const final = await settled(controller);
    await controller.stop();

    expect(controller.getSnapshot()).toMatchObject({ status: 'error', error: 'disk full', sensorError: null });
    expect(final.status).toBe('error');
    expect(sensor.getStatus()).toBe('stopped');
    expect(scheduler.activeTimers).toBe(0);
  });

  it('keeps a start failure that arrives after stop() won the race as that session\'s outcome', async () => {
    const { controller } = createController();
    const sensor = new DeferredStartSensor();
    const starting = controller.start({ sensor, calibration });
    await flush();
    expect(controller.getSnapshot().status).toBe('recording');
    await controller.stop();
    expect(controller.getSnapshot().status).toBe('finished');

    sensor.rejectStart({ code: 'start_failed', message: 'Port open timed out' });
    await expect(starting).rejects.toBeInstanceOf(SensorStartError);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      sensorError: { code: 'start_failed', message: 'Port open timed out' },
    });
  });

  it('stops the sensor again when its start() completes after stop() won the race', async () => {
    const { controller } = createController();
    const sensor = new DeferredStartSensor();
    const starting = controller.start({ sensor, calibration });
    await flush();
    await controller.stop();
    const stopsBefore = sensor.stopCalls;

    sensor.resolveStart();
    await starting;
    expect(sensor.stopCalls).toBe(stopsBefore + 1);
    expect(controller.getSnapshot().status).toBe('finished');
  });

  it('does not let a late start failure of an old session touch a newer one', async () => {
    const { controller } = createController();
    const sensor = new DeferredStartSensor();
    const starting = controller.start({ sensor, calibration });
    await flush();
    await controller.stop();
    controller.reset();
    const live = faultySensor({ afterSamples: 10_000, code: 'unknown' });
    const newer = await controller.start({ sensor: live.sensor, calibration });

    sensor.rejectStart({ code: 'start_failed', message: 'Port open timed out' });
    await expect(starting).rejects.toBeInstanceOf(SensorStartError);
    expect(controller.getSnapshot()).toMatchObject({ status: 'recording', sessionId: newer, error: null, sensorError: null });
    await controller.stop();
  });

  it('stays locked until finalisation completes, even when a write fails meanwhile', async () => {
    const repositories = createInMemoryRepositories();
    repositories.rawSamples.appendBatch = async () => {
      throw new Error('disk full');
    };
    const markEnded = repositories.sessions.markEnded.bind(repositories.sessions);
    let finishMarkEnded: () => void = () => {};
    repositories.sessions.markEnded = (id, at) =>
      new Promise<void>((resolve) => {
        finishMarkEnded = () => void markEnded(id, at).then(resolve);
      });
    const { controller } = createController(repositories);
    // Immediate replay ends inside start(), so finalisation begins at once and waits on markEnded.
    await controller.start({ sensor: new ReplaySensorSource({ id: 'replay-1', samples: labelledSetTrace().samples }), calibration });
    await flush();

    expect(controller.getSnapshot().status).toBe('stopping');
    expect(() => controller.reset()).toThrow(/in progress/);
    await expect(controller.start({ sensor: new ReplaySensorSource({ id: 'r2', samples: [] }), calibration })).rejects.toThrow(
      /in progress/,
    );

    finishMarkEnded();
    const final = await settled(controller);
    expect(final).toMatchObject({ status: 'error', error: 'disk full' });
    controller.reset();
    expect(controller.getSnapshot().status).toBe('idle');
  });

  it('can be reset to idle after finishing', async () => {
    const { controller } = createController();
    await controller.start({ sensor: new ReplaySensorSource({ id: 'r', samples: [] }), calibration });
    await settled(controller);
    controller.reset();
    expect(controller.getSnapshot().status).toBe('idle');
  });
});
