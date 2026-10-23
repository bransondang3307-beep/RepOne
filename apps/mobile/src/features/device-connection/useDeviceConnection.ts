import { useStore } from 'zustand';
import { useAppServices, type AppContainer } from '../../application';
import {
  createDeviceConnectionStore,
  type DeviceConnectionState,
  type DeviceConnectionStore,
} from './deviceConnectionStore';

// One store per composed container (no module-level singleton).
const stores = new WeakMap<AppContainer, DeviceConnectionStore>();

/** Feature hook: the sensor device's connection state and actions. */
export function useDeviceConnection<T>(selector: (state: DeviceConnectionState) => T): T {
  const container = useAppServices();
  let store = stores.get(container);
  if (!store) {
    store = createDeviceConnectionStore(container);
    stores.set(container, store);
  }
  return useStore(store, selector);
}
