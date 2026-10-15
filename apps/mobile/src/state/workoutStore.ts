import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SessionSnapshot, WorkoutSessionSummary } from '@repone/core';
import type { AppContainer } from '../di/createAppContainer';

export interface WorkoutState {
  readonly session: SessionSnapshot;
  readonly history: readonly WorkoutSessionSummary[];
  readonly historyError: string | null;
  startSimulatedSet(machineLabel?: string): Promise<void>;
  stop(): Promise<void>;
  dismissResult(): void;
  refreshHistory(): Promise<void>;
}

export type WorkoutStore = StoreApi<WorkoutState>;

/**
 * Thin UI-state adapter over the core session controller. Business rules live
 * in @repone/core; this store only mirrors snapshots and exposes actions.
 */
export function createWorkoutStore(
  container: Pick<AppContainer, 'controller' | 'repositories' | 'createSensor' | 'getCalibration'>,
): WorkoutStore {
  const { controller, repositories } = container;

  const store = createStore<WorkoutState>()((set) => ({
    session: controller.getSnapshot(),
    history: [],
    historyError: null,

    async startSimulatedSet(machineLabel) {
      await controller.start({
        sensor: container.createSensor(),
        calibration: container.getCalibration(),
        machineLabel: machineLabel?.trim() || null,
      });
    },

    async stop() {
      await controller.stop();
    },

    dismissResult() {
      controller.reset();
    },

    async refreshHistory() {
      try {
        set({ history: await repositories.sessions.listRecent(50), historyError: null });
      } catch (error) {
        set({ historyError: error instanceof Error ? error.message : String(error) });
      }
    },
  }));

  controller.subscribe((session) => {
    store.setState({ session });
    if (session.status === 'finished') void store.getState().refreshHistory();
  });

  return store;
}
