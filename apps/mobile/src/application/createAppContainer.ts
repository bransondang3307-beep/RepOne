import { RotationalRepDetector } from '@repone/rep-engine';
import {
  DEMO_LOOP_SCRIPT,
  SimulatedDevice,
  combineChannels,
  createSyntheticCalibration,
  systemClock,
  type Clock,
  type RepCalibration,
  type Scheduler,
  type SensorSource,
} from '@repone/sensor-contracts';
import type { Repositories } from '@repone/workout-domain';
import { createNativeBleCentral, type BleCentral } from '../infrastructure/bluetooth';
import { createSqliteRepositories, migrate, openExpoSqliteDatabase } from '../infrastructure/database';
import { createSensorSelection, type SensorSelection } from './sensorSelection';
import { WorkoutSessionController } from './services/WorkoutSessionController';

/** Application services exposed to features. Features never see infrastructure. */
export interface AppContainer {
  readonly repositories: Repositories;
  readonly controller: WorkoutSessionController;
  /**
   * Which sensor device sessions record from (ADR 0007 §4, RO-029): the simulated device, or a real BLE sensor the
   * user picked. Nothing downstream depends on which one is used.
   */
  readonly sensors: SensorSelection;
  /**
   * Connects the chosen device if needed and returns the source for the next session: its first channel. The
   * device's channels are checked first, so two sensors can never share a `source_id` within a session (ADR 0007 §2).
   */
  readonly getSessionSensor: () => Promise<SensorSource>;
  /**
   * Test control: drops the simulated device's connection, to exercise the failure path on a phone. It acts only
   * while the simulated device is the chosen one; real devices are never affected.
   */
  readonly simulateConnectionLoss: () => void;
  readonly getCalibration: () => RepCalibration;
}

export interface AssembleOptions {
  /** Drives the simulated device; tests pass a ManualScheduler. Default: real timers. */
  readonly scheduler?: Scheduler;
  /** Seed of the simulated motion. Default: random per app start. */
  readonly seed?: number;
  /** The BLE central: tests pass a fake, or null for "no BLE". Default: the native one, null in Expo Go. */
  readonly bleCentral?: BleCentral | null;
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
  const simulated = new SimulatedDevice({
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
  const sensors = createSensorSelection({
    simulated,
    central: options.bleCentral !== undefined ? options.bleCentral : createNativeBleCentral(),
    scheduler: options.scheduler,
  });
  return {
    repositories,
    controller,
    sensors,
    getSessionSensor: async () => {
      const device = sensors.device;
      await device.connect();
      const [channel] = combineChannels(device.getChannels()).channels;
      if (!channel) throw new Error('The sensor offers no channels');
      return channel.source;
    },
    simulateConnectionLoss: () => {
      if (sensors.device === simulated) simulated.simulateConnectionLoss('connection loss simulated from the app');
    },
    getCalibration: () => createSyntheticCalibration(clock.now()),
  };
}

/** Composition root: the only place concrete implementations are chosen. */
export async function createAppContainer(): Promise<AppContainer> {
  const db = await openExpoSqliteDatabase('repone.db');
  await migrate(db);
  return assembleContainer(createSqliteRepositories(db));
}
