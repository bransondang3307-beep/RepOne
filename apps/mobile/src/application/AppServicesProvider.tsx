import { createContext, useContext, type ReactNode } from 'react';
import type { AppContainer } from './createAppContainer';

const AppServicesContext = createContext<AppContainer | null>(null);

/** Makes the composed application services available to feature hooks. */
export function AppServicesProvider({ container, children }: { container: AppContainer; children: ReactNode }) {
  return <AppServicesContext.Provider value={container}>{children}</AppServicesContext.Provider>;
}

export function useAppServices(): AppContainer {
  const container = useContext(AppServicesContext);
  if (!container) throw new Error('useAppServices must be used inside AppServicesProvider');
  return container;
}
