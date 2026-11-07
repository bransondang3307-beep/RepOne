// RO-013 (ADR 0010 §5 decision 6, ADR 0007 Decisions 1 and 3): the controller stores why each recording ended and
// the channel each rep came from. SYNTHETIC sensors only.
import { RotationalRepDetector } from '@repone/rep-engine';
import {
  BaseSensorSource,
  DEMO_LOOP_SCRIPT,
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SimulatedSensorSource,
  createSyntheticCalibration,
  generateTrace,
  type SensorError,
  type SimulatedFault,
  type SimulationOptions,
} from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createInMemoryRepositories, type Repositories } from '@repone/workout-domain';
import { WorkoutSessionController } from '../WorkoutSessionController';

const SIMULATION: SimulationOptions = { sourceId: 'sim-test-01', sampleRateHz: 50, seed: 42, gyroNoiseRadS: 0.02 };
const calibration = createSyntheticCalibration(0);
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function setup(repositories: Repositories = createInMemoryRepositories()) {
  let n = 0;
  let now = 1_700_000_000_000;
  const controller = new WorkoutSessionController({
    repositories,
    clock: { now: () => (now += 1000) },
    createId: () => `session-${++n}`,
    createDetector: (id, cal) => new RotationalRepDetector(id, cal),
  });
  return { controller, repositories };
}

async function settle(controller: WorkoutSessionController) {
  for (let i = 0; i < 50 && !['finished', 'error'].includes(controller.getSnapshot().status); i++) await flush();
  return controller.getSnapshot();
}

const faulty = (fault: SimulatedFault) => {
  const scheduler = new ManualScheduler();
  return { scheduler, sensor: new SimulatedSensorSource({ script: LABELLED_SET_SCRIPT, simulation: SIMULATION, scheduler, fault }) };
};

class DeferredStartSensor extends BaseSensorSource {
  private settleStart: { resolve: () => void; reject: (e: unknown) => void } | null = null;
  constructor() {
    super('deferred-01', 'usb_serial', 'sensor');
  }
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.settleStart = { resolve, reject };
    });
  }
  async stop(): Promise<void> {}
  rejectStart(error: SensorError): void {
    this.fail(error);
    this.settleStart?.reject(Object.assign(new Error(error.message), { sensorError: error }));
  }
}

describe('WorkoutSessionController: stored recording outcome', () => {
  it('stopped by the user → stopped', async () => {
    const { controller, repositories } = setup();
    const scheduler = new ManualScheduler();
    const id = await controller.start({ sensor: new SimulatedSensorSource({ script: DEMO_LOOP_SCRIPT, simulation: SIMULATION, scheduler }), calibration });
    scheduler.advance(2000);
    await controller.stop();
    expect(await repositories.sessions.getOutcome(id)).toEqual({ end_reason: 'stopped', sensor_error_code: null });
  });

  it('a finite stream that ends by itself → stream_ended', async () => {
    const { controller, repositories } = setup();
    const id = await controller.start({ sensor: new ReplaySensorSource({ id: 'replay-1', samples: generateTrace(LABELLED_SET_SCRIPT, SIMULATION).samples }), calibration });
    await settle(controller);
    expect(await repositories.sessions.getOutcome(id)).toEqual({ end_reason: 'stream_ended', sensor_error_code: null });
  });

  it('the sensor fails mid-set → sensor_error with its code', async () => {
    const { controller, repositories } = setup();
    const { scheduler, sensor } = faulty({ afterSamples: 120, code: 'connection_lost' });
    const id = await controller.start({ sensor, calibration });
    scheduler.advance(5000);
    await settle(controller);
    expect(await repositories.sessions.getOutcome(id)).toEqual({ end_reason: 'sensor_error', sensor_error_code: 'connection_lost' });
  });

  it('the sensor cannot start → start_failed with its code', async () => {
    const { controller, repositories } = setup();
    const { sensor } = faulty({ afterSamples: 0, code: 'start_failed', message: 'Port busy' });
    await expect(controller.start({ sensor, calibration })).rejects.toThrow();
    const id = controller.getSnapshot().sessionId!;
    expect(await repositories.sessions.getOutcome(id)).toEqual({ end_reason: 'start_failed', sensor_error_code: 'start_failed' });
  });

  it('a start failure arriving after stop() won the race replaces the stored "stopped", keeping the end time', async () => {
    const { controller, repositories } = setup();
    const sensor = new DeferredStartSensor();
    const starting = controller.start({ sensor, calibration });
    await flush();
    await controller.stop();
    const id = controller.getSnapshot().sessionId!;
    expect(await repositories.sessions.getOutcome(id)).toEqual({ end_reason: 'stopped', sensor_error_code: null });
    const endedAt = (await repositories.sessions.getById(id))!.ended_at_epoch_ms;

    sensor.rejectStart({ code: 'start_failed', message: 'Port open timed out' });
    await expect(starting).rejects.toThrow();
    expect(await repositories.sessions.getOutcome(id)).toEqual({ end_reason: 'start_failed', sensor_error_code: 'start_failed' });
    expect((await repositories.sessions.getById(id))!.ended_at_epoch_ms).toBe(endedAt);
  });

  it('a failed write outranks everything → write_failed', async () => {
    const repositories = createInMemoryRepositories();
    repositories.rawSamples.appendBatch = async () => {
      throw new Error('disk full');
    };
    const { controller } = setup(repositories);
    const id = await controller.start({ sensor: new ReplaySensorSource({ id: 'replay-1', samples: generateTrace(LABELLED_SET_SCRIPT, SIMULATION).samples }), calibration });
    await settle(controller);
    expect(await repositories.sessions.getOutcome(id)).toEqual({ end_reason: 'write_failed', sensor_error_code: null });
  });
});

describe('WorkoutSessionController: rep events keep their channel', () => {
  it("stores each rep event with the sensor's source_id", async () => {
    const { controller, repositories } = setup();
    const id = await controller.start({ sensor: new ReplaySensorSource({ id: 'imu-0011-ch0', samples: generateTrace(LABELLED_SET_SCRIPT, SIMULATION).samples }), calibration });
    await settle(controller);
    const sources = await repositories.repEvents.listSourceIdsBySession(id);
    expect(sources).toHaveLength(10);
    expect(new Set(sources)).toEqual(new Set(['imu-0011-ch0']));
  });
});
