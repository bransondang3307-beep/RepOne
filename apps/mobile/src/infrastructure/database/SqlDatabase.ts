export type SqlValue = string | number | null;

/**
 * Minimal async SQL port. The app adapts expo-sqlite to it; tests adapt Node's
 * built-in `node:sqlite`. Repository code never imports a concrete driver.
 */
export interface SqlDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  /** Runs `work` atomically; rolls back if it throws. */
  transaction(work: () => Promise<void>): Promise<void>;
}
