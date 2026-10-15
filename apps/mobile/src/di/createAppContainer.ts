import {
  DEMO_LOOP_SCRIPT,
  RotationalRepDetector,
  SimulatedSensorSource,
  WorkoutSessionController,
  createSqliteRepositories,
  createSyntheticCalibration,
  migrate,
  systemClock,
  type Clock,
  type RepCalibration,
  type Repositories,
  type SensorSource,
} from '@repone/core';
import { openExpoSqliteDatabase } from '../persistence/expoSqliteDatabase';

/** Everything screens and stores are allowed to depend on. */
export interface AppContainer {
  readonly repositories: Repositories;
  readonly controller: WorkoutSessionController;
  /** Source for the next session. Sprint 1: simulated only; BLE will plug in here. */
  readonly createSensor: () => SensorSource;
  readonly getCalibration: () => RepCalibration;
}

export const createLocalId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Wire concrete implementations to core interfaces given a repositories bundle. */
export function assembleContainer(repositories: Repositories, clock: Clock = systemClock): AppContainer {
  const controller = new WorkoutSessionController({
    repositories,
    clock,
    createId: createLocalId,
    createDetector: (sessionId, calibration) => new RotationalRepDetector(sessionId, calibration),
  });
  return {
    repositories,
    controller,
    createSensor: () =>
      new SimulatedSensorSource({
        script: DEMO_LOOP_SCRIPT,
        simulation: {
          sourceId: 'simulated-imu-01',
          sampleRateHz: 50,
          seed: Math.floor(Math.random() * 2 ** 31),
          gyroNoiseRadS: 0.02,
          accelNoiseMS2: 0.05,
        },
      }),
    getCalibration: () => createSyntheticCalibration(clock.now()),
  };
}

/** Composition root: the only place concrete implementations are chosen. */
export async function createAppContainer(): Promise<AppContainer> {
  const db = await openExpoSqliteDatabase('repone.db');
  await migrate(db);
  return assembleContainer(createSqliteRepositories(db));
}
