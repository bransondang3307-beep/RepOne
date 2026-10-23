import { RotationalRepDetector } from '@repone/rep-engine';
import {
  DEMO_LOOP_SCRIPT,
  SimulatedDevice,
  combineChannels,
  createSyntheticCalibration,
  systemClock,
  type Clock,
  type DeviceConnection,
  type RepCalibration,
  type Scheduler,
  type SensorSource,
} from '@repone/sensor-contracts';
import type { Repositories } from '@repone/workout-domain';
import { createSqliteRepositories, migrate, openExpoSqliteDatabase } from '../infrastructure/database';
import { WorkoutSessionController } from './services/WorkoutSessionController';

/** Application services exposed to features. Features never see infrastructure. */
export interface AppContainer {
  readonly repositories: Repositories;
  readonly controller: WorkoutSessionController;
  /**
   * The sensor device (ADR 0007 §4). Milestone 2: a simulated single-IMU device. Real USB-serial or BLE
   * adapters plug in here later; nothing downstream depends on which one is used.
   */
  readonly device: DeviceConnection;
  /**
   * Connects the device if needed and returns the source for the next session: its first channel. The device's
   * channels are checked first, so two sensors can never share a `source_id` within a session (ADR 0007 §2).
   */
  readonly getSessionSensor: () => Promise<SensorSource>;
  /**
   * Test control: drops the simulated device's connection, to exercise the failure path on a phone. Present only
   * for the simulated device; null for real devices.
   */
  readonly simulateConnectionLoss: (() => void) | null;
  readonly getCalibration: () => RepCalibration;
}

export interface AssembleOptions {
  /** Drives the simulated device; tests pass a ManualScheduler. Default: real timers. */
  readonly scheduler?: Scheduler;
  /** Seed of the simulated motion. Default: random per app start. */
  readonly seed?: number;
}

export const createLocalId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Wire concrete implementations to core interfaces given a repositories bundle. */
export function assembleContainer(
  repositories: Repositories,
  clock: Clock = systemClock,
  options: AssembleOptions = {},
): AppContainer {
  const controller = new WorkoutSessionController({
    repositories,
    clock,
    createId: createLocalId,
    createDetector: (sessionId, calibration) => new RotationalRepDetector(sessionId, calibration),
  });
  const device = new SimulatedDevice({
    deviceId: 'simulated-device-01',
    scheduler: options.scheduler,
    channels: [
      {
        script: DEMO_LOOP_SCRIPT,
        simulation: {
          sourceId: 'simulated-imu-01',
          sampleRateHz: 50,
          seed: options.seed ?? Math.floor(Math.random() * 2 ** 31),
          gyroNoiseRadS: 0.02,
          accelNoiseMS2: 0.05,
        },
      },
    ],
  });
  return {
    repositories,
    controller,
    device,
    getSessionSensor: async () => {
      await device.connect();
      const [channel] = combineChannels(device.getChannels()).channels;
      return channel!.source;
    },
    simulateConnectionLoss: () => device.simulateConnectionLoss('connection loss simulated from the app'),
    getCalibration: () => createSyntheticCalibration(clock.now()),
  };
}

/** Composition root: the only place concrete implementations are chosen. */
export async function createAppContainer(): Promise<AppContainer> {
  const db = await openExpoSqliteDatabase('repone.db');
  await migrate(db);
  return assembleContainer(createSqliteRepositories(db));
}
