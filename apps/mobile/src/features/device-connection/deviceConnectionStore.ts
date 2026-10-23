import type { ConnectionError, ConnectionState, DeviceTransport } from '@repone/sensor-contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppContainer } from '../../application';

export interface DeviceConnectionState {
  readonly deviceId: string;
  readonly transport: DeviceTransport;
  readonly connectionState: ConnectionState;
  /** Why the connection failed; null unless `connectionState` is `failed`. */
  readonly error: ConnectionError | null;
  /** Never throws: a failed attempt shows up as `connectionState: 'failed'` with its `error`. */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export type DeviceConnectionStore = StoreApi<DeviceConnectionState>;

/** Thin UI-state adapter over the container's DeviceConnection (ADR 0007 §4). */
export function createDeviceConnectionStore(container: Pick<AppContainer, 'device'>): DeviceConnectionStore {
  const { device } = container;
  const store = createStore<DeviceConnectionState>()(() => ({
    deviceId: device.deviceId,
    transport: device.transport,
    connectionState: device.getState(),
    error: device.getLastError(),

    async connect() {
      // The rejection carries the same reason the device publishes with `failed`, which the state mirrors.
      await device.connect().catch(() => undefined);
    },

    async disconnect() {
      await device.disconnect();
    },
  }));
  device.subscribeState((connectionState) => store.setState({ connectionState, error: device.getLastError() }));
  return store;
}
