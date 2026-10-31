import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppContainer, SessionSnapshot } from '../../application';

export interface LiveSessionState {
  readonly session: SessionSnapshot;
  startSimulatedSet(machineLabel?: string): Promise<void>;
  stop(): Promise<void>;
  dismissResult(): void;
}

export type LiveSessionStore = StoreApi<LiveSessionState>;

/**
 * Thin UI-state adapter over the session controller (application service).
 * Business rules live in the service and packages; this store only mirrors
 * snapshots and exposes actions.
 */
export function createLiveSessionStore(
  container: Pick<AppContainer, 'controller' | 'getSessionSensor' | 'getCalibration'>,
): LiveSessionStore {
  const { controller } = container;

  const store = createStore<LiveSessionState>()(() => ({
    session: controller.getSnapshot(),

    async startSimulatedSet(machineLabel) {
      // Connects the (simulated) device first if it is not connected yet.
      const sensor = await container.getSessionSensor();
      await controller.start({
        sensor,
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
  }));

  controller.subscribe((session) => store.setState({ session }));
  return store;
}
