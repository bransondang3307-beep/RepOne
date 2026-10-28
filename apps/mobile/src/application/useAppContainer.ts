import { useEffect, useState } from 'react';
import { createAppContainer, type AppContainer } from './createAppContainer';

type BootState =
  | { status: 'loading' }
  | { status: 'ready'; container: AppContainer }
  | { status: 'error'; message: string };

/** Boots the composition root once (opens + migrates the local database). */
export function useAppContainer(): BootState {
  const [state, setState] = useState<BootState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    createAppContainer().then(
      (container) => !cancelled && setState({ status: 'ready', container }),
      (error: unknown) =>
        !cancelled && setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
