import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { AppContainer } from '../di/createAppContainer';
import { createWorkoutStore, type WorkoutState, type WorkoutStore } from './workoutStore';

const WorkoutStoreContext = createContext<WorkoutStore | null>(null);

export function WorkoutStoreProvider({ container, children }: { container: AppContainer; children: ReactNode }) {
  const store = useMemo(() => createWorkoutStore(container), [container]);
  return <WorkoutStoreContext.Provider value={store}>{children}</WorkoutStoreContext.Provider>;
}

export function useWorkout<T>(selector: (state: WorkoutState) => T): T {
  const store = useContext(WorkoutStoreContext);
  if (!store) throw new Error('useWorkout must be used inside WorkoutStoreProvider');
  return useStore(store, selector);
}
