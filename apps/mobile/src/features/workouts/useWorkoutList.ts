import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useAppServices } from '../../application';
import { loadWorkoutList, type WorkoutListItem } from './workoutList';

export interface WorkoutListState {
  readonly workouts: readonly WorkoutListItem[];
  readonly loading: boolean;
  readonly error: string | null;
}

/** Feature hook: recent workouts with their sets, reloaded whenever the screen gains focus. */
export function useWorkoutList(limit = 20): WorkoutListState {
  const { repositories } = useAppServices();
  const [state, setState] = useState<WorkoutListState>({ workouts: [], loading: true, error: null });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadWorkoutList(repositories, limit).then(
        (workouts) => !cancelled && setState({ workouts, loading: false, error: null }),
        (e: unknown) => !cancelled && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })),
      );
      return () => {
        cancelled = true;
      };
    }, [repositories, limit]),
  );

  return state;
}
