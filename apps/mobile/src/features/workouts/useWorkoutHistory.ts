import type { WorkoutSessionSummary } from '@repone/workout-domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useAppServices } from '../../application';

export interface WorkoutHistoryState {
  readonly sessions: readonly WorkoutSessionSummary[];
  readonly loading: boolean;
  readonly error: string | null;
}

/** Feature hook: recent recorded sets, reloaded whenever the screen gains focus. */
export function useWorkoutHistory(limit = 50): WorkoutHistoryState {
  const { repositories } = useAppServices();
  const [state, setState] = useState<WorkoutHistoryState>({ sessions: [], loading: true, error: null });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      repositories.sessions.listRecent(limit).then(
        (sessions) => !cancelled && setState({ sessions, loading: false, error: null }),
        (e: unknown) =>
          !cancelled && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })),
      );
      return () => {
        cancelled = true;
      };
    }, [repositories, limit]),
  );

  return state;
}
