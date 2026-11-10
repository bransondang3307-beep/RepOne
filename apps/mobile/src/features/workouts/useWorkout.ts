import { useStore } from 'zustand';
import { useAppServices, type AppContainer } from '../../application';
import { createWorkoutStore, type WorkoutState, type WorkoutStore } from './workoutStore';

// One store per composed container (no module-level singleton), as for the live session.
const stores = new WeakMap<AppContainer, WorkoutStore>();

export function workoutStoreFor(container: AppContainer): WorkoutStore {
  let store = stores.get(container);
  if (!store) {
    store = createWorkoutStore(container);
    stores.set(container, store);
    void store.getState().load();
  }
  return store;
}

/** Feature hook: the current workout and its actions. */
export function useWorkout<T>(selector: (state: WorkoutState) => T): T {
  return useStore(workoutStoreFor(useAppServices()), selector);
}
