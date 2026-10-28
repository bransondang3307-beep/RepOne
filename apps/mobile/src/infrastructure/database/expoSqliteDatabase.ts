import { openDatabaseAsync } from 'expo-sqlite';
import type { SqlDatabase } from './SqlDatabase';

/**
 * Adapts expo-sqlite to the core `SqlDatabase` port. This is the only file in
 * the app that touches the expo-sqlite driver directly.
 *
 * Note: `withTransactionAsync` is not exclusive; that is safe here because
 * `WorkoutSessionController` serialises all writes through one queue.
 */
export async function openExpoSqliteDatabase(name: string): Promise<SqlDatabase> {
  const db = await openDatabaseAsync(name);
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      await db.runAsync(sql, [...params]);
    },
    all: <T>(sql: string, params: readonly (string | number | null)[] = []) => db.getAllAsync<T>(sql, [...params]),
    transaction: (work) => db.withTransactionAsync(work),
  };
}
