import { useStore } from 'zustand';
import { useAppServices, type AppContainer } from '../../application';
import { createLiveSessionStore, type LiveSessionState, type LiveSessionStore } from './liveSessionStore';

// One store per composed container (no module-level singleton).
const stores = new WeakMap<AppContainer, LiveSessionStore>();

/** Feature hook: live rep-tracking state and actions. */
export function useLiveSession<T>(selector: (state: LiveSessionState) => T): T {
  const container = useAppServices();
  let store = stores.get(container);
  if (!store) {
    store = createLiveSessionStore(container);
    stores.set(container, store);
  }
  return useStore(store, selector);
}
