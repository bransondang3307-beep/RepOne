/// <reference types="node" />
// Test-only adapter: Node's built-in SQLite behind the same SqlDatabase port as expo-sqlite.
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlValue } from '../SqlDatabase';

export function openNodeSqliteDatabase(path = ':memory:'): SqlDatabase & { close(): void } {
  const db = new DatabaseSync(path);
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: readonly SqlValue[] = []) {
      db.prepare(sql).run(...params);
    },
    async all<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async transaction(work) {
      db.exec('BEGIN');
      try {
        await work();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
}
