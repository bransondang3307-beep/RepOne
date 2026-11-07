/// <reference types="node" />
// Migration v2 (RO-013, ADR 0010) against the acceptance criteria of docs/plans/RO-013-milestone-3-plan.md §5.
// The data is SYNTHETIC (simulated recordings), as all saved data is today.
import { createHash } from 'node:crypto';
import { createSqliteRepositories } from '../createSqliteRepositories';
import { MIGRATIONS, migrate } from '../migrations';
import type { SqlDatabase } from '../SqlDatabase';
import { openNodeSqliteDatabase } from './nodeSqliteDatabase';

const V1 = MIGRATIONS.slice(0, 1);
const OLD_TABLES = ['calibrations', 'workout_sessions', 'raw_samples', 'rep_events'] as const;
const NEW_TABLES = ['machines', 'exercises', 'exercise_machines', 'workouts', 'workout_pauses', 'workout_exercises', 'workout_sets'];

async function version(db: SqlDatabase): Promise<number> {
  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version;');
  return row!.user_version;
}

async function tables(db: SqlDatabase): Promise<string[]> {
  const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  return rows.map((r) => r.name);
}

async function columns(db: SqlDatabase, table: string): Promise<string[]> {
  return (await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).map((r) => r.name);
}

async function dump(db: SqlDatabase, table: string, cols?: readonly string[]) {
  return db.all(`SELECT ${cols ? cols.join(', ') : '*'} FROM ${table} ORDER BY rowid`);
}

/** A v1 database holding what an existing install has: a calibration, two recordings, samples and rep events. */
async function v1WithData() {
  const db = openNodeSqliteDatabase();
  await migrate(db, V1);
  await db.run(
    `INSERT INTO calibrations VALUES ('cal-1', 0, 0.001, -0.002, 0.0005, 1.2217, 'synthetic', 1700000000000)`,
  );
  for (const [id, start, end] of [
    ['rec-1', 1700000001000, 1700000060000],
    ['rec-2', 1700000100000, null],
  ] as const) {
    await db.run(
      `INSERT INTO workout_sessions VALUES (?, 'gym', 'simulated', 'simulated-imu-01', 'simulated', 'cal-1',
         'rotational-rep-fsm-0.1.0', 'Seated row (test rig)', ?, ?)`,
      [id, start, end],
    );
  }
  for (let i = 0; i < 25; i++) {
    await db.run(`INSERT INTO raw_samples VALUES ('rec-1', ?, 'simulated-imu-01', 0.01, 0.02, 9.81, ?, 0, 0, '["synthetic"]')`, [
      i * 20,
      0.1 * i,
    ]);
  }
  for (const [t, cls] of [
    [3000, 'full'],
    [6000, 'partial'],
    [9000, 'full'],
  ] as const) {
    await db.run(
      `INSERT INTO rep_events VALUES ('rec-1', ?, ?, ?, 1.1, NULL, 'cal-1', 'rotational-rep-fsm-0.1.0', 'imu_algorithm', '["synthetic"]')`,
      [t, t - 1500, cls],
    );
  }
  return db;
}

describe('migration v2 (RO-013 plan §5)', () => {
  it('1. fresh install: reaches v2 with every new table and column, and no foreign-key violations', async () => {
    const db = openNodeSqliteDatabase();
    expect(await migrate(db)).toBe(2);
    expect(await tables(db)).toEqual(expect.arrayContaining([...OLD_TABLES, ...NEW_TABLES]));
    expect(await columns(db, 'workout_sessions')).toEqual(expect.arrayContaining(['end_reason', 'sensor_error_code']));
    expect(await columns(db, 'rep_events')).toContain('source_id');
    expect(await columns(db, 'workout_sets')).toEqual(
      expect.arrayContaining(['resistance_kg', 'resistance_entered_unit', 'resistance_source', 'recording_session_id']),
    );
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    db.close();
  });

  it('2. upgrade with data: every existing row and value is unchanged, new columns are null, history reads the same', async () => {
    const db = await v1WithData();
    const before: Record<string, unknown[]> = {};
    const v1Columns: Record<string, string[]> = {};
    for (const table of OLD_TABLES) {
      v1Columns[table] = await columns(db, table);
      before[table] = await dump(db, table);
    }
    const historyBefore = await createSqliteRepositories(db).sessions.listRecent(10);
    expect(historyBefore.map((s) => [s.id, s.full_rep_count, s.partial_rep_count])).toEqual([
      ['rec-2', 0, 0],
      ['rec-1', 2, 1],
    ]);

    expect(await migrate(db)).toBe(2);

    for (const table of OLD_TABLES) {
      expect({ table, rows: await dump(db, table, v1Columns[table]) }).toEqual({ table, rows: before[table] });
    }
    expect(await db.all('SELECT end_reason, sensor_error_code FROM workout_sessions')).toEqual([
      { end_reason: null, sensor_error_code: null },
      { end_reason: null, sensor_error_code: null },
    ]);
    expect(await db.all('SELECT DISTINCT source_id FROM rep_events')).toEqual([{ source_id: null }]);
    const repos = createSqliteRepositories(db);
    expect(await repos.sessions.listRecent(10)).toEqual(historyBefore);
    expect(await repos.sessions.getOutcome('rec-1')).toBeNull(); // not recorded, not "stopped"
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    db.close();
  });

  it('3. atomic: a v2 migration failing partway leaves v1 and its data intact, and the next launch retries', async () => {
    const db = await v1WithData();
    const before = await dump(db, 'rep_events');
    const failing = [MIGRATIONS[0]!, `${MIGRATIONS[1]!}\n  INSERT INTO no_such_table VALUES (1);`];
    await expect(migrate(db, failing)).rejects.toThrow();
    expect(await version(db)).toBe(1);
    expect(await tables(db)).not.toContain('workouts');
    expect(await columns(db, 'rep_events')).not.toContain('source_id');
    expect(await dump(db, 'rep_events')).toEqual(before);
    expect(await migrate(db)).toBe(2); // retried on the next launch
    db.close();
  });

  it('4. idempotent: migrating a v2 database again changes nothing', async () => {
    const db = await v1WithData();
    await migrate(db);
    const schema = await db.all("SELECT type, name, sql FROM sqlite_master ORDER BY name");
    const sessions = await dump(db, 'workout_sessions');
    expect(await migrate(db)).toBe(2);
    expect(await db.all("SELECT type, name, sql FROM sqlite_master ORDER BY name")).toEqual(schema);
    expect(await dump(db, 'workout_sessions')).toEqual(sessions);
    db.close();
  });

  it('5. newer-schema guard: an app that knows only v1 refuses a v2 database and does not modify it', async () => {
    const db = await v1WithData();
    await migrate(db);
    const schema = await db.all("SELECT type, name, sql FROM sqlite_master ORDER BY name");
    await expect(migrate(db, V1)).rejects.toThrow('Database schema v2 is newer than this app supports (v1)');
    expect(await version(db)).toBe(2);
    expect(await db.all("SELECT type, name, sql FROM sqlite_master ORDER BY name")).toEqual(schema);
    db.close();
  });

  it('6. append-only: the shipped v1 migration is byte-identical to main before RO-013', () => {
    const hash = createHash('sha256').update(MIGRATIONS[0]!.replace(/\r\n/g, '\n')).digest('hex');
    expect(hash).toBe('5cfb4627fed2e87de9cdb42e203222678216a31c49cb02a7ba8626ffdfeffa4e');
  });

  describe('7. constraints hold in the database itself, not only in TypeScript', () => {
    let db: ReturnType<typeof openNodeSqliteDatabase>;
    beforeEach(async () => {
      db = await v1WithData();
      await migrate(db);
      await db.run("INSERT INTO exercises VALUES ('ex-1', 'Row', 1)");
      await db.run("INSERT INTO workouts VALUES ('w1', 'active', 1, 2, NULL)");
      await db.run("INSERT INTO workout_exercises VALUES ('we1', 'w1', 'ex-1', NULL, 0)");
    });
    afterEach(() => db.close());

    const set = (id: string, overrides: Record<string, string | number | null> = {}) => {
      const values: Record<string, string | number | null> = {
        id,
        workout_exercise_id: 'we1',
        position: Number(id.replace(/\D/g, '')) || 0,
        status: 'planned',
        recording_session_id: null,
        resistance_kg: 40,
        resistance_entered_unit: 'kg',
        resistance_source: 'user_entered',
        ...overrides,
      };
      return db.run(`INSERT INTO workout_sets (${Object.keys(values).join(', ')}) VALUES (${Object.keys(values).map(() => '?').join(', ')})`, Object.values(values));
    };

    it('accepts a valid user-entered resistance and a set without one', async () => {
      await set('s1');
      await set('s2', { resistance_kg: null, resistance_entered_unit: null, resistance_source: null });
    });

    it('rejects a resistance source other than user_entered (e.g. measured)', async () => {
      await expect(set('s1', { resistance_source: 'measured' })).rejects.toThrow(/CHECK/);
    });

    it('rejects a non-positive resistance, an unknown unit, and a half-filled resistance', async () => {
      await expect(set('s1', { resistance_kg: 0 })).rejects.toThrow(/CHECK/);
      await expect(set('s2', { resistance_entered_unit: 'stone' })).rejects.toThrow(/CHECK/);
      await expect(set('s3', { resistance_source: null })).rejects.toThrow(/CHECK/);
    });

    it('rejects an unknown end_reason', async () => {
      await expect(db.run("UPDATE workout_sessions SET end_reason = 'gave_up' WHERE id = 'rec-1'")).rejects.toThrow(/CHECK/);
      await db.run("UPDATE workout_sessions SET end_reason = 'stopped' WHERE id = 'rec-1'");
    });

    it('rejects a set pointing at a missing workout exercise, and an unknown set status', async () => {
      await expect(set('s1', { workout_exercise_id: 'missing' })).rejects.toThrow(/FOREIGN KEY/);
      await expect(set('s2', { status: 'skipped' })).rejects.toThrow(/CHECK/);
    });

    it('8. deleting a workout removes its exercises, sets and pauses but never a recording or its data', async () => {
      await set('s1', { status: 'completed', recording_session_id: 'rec-1' });
      await db.run("INSERT INTO workout_pauses VALUES ('w1', 0, 10, 20)");
      await db.run("DELETE FROM workouts WHERE id = 'w1'");
      for (const table of ['workout_exercises', 'workout_sets', 'workout_pauses']) {
        expect(await db.all(`SELECT COUNT(*) AS n FROM ${table}`)).toEqual([{ n: 0 }]);
      }
      expect(await db.all("SELECT COUNT(*) AS n FROM workout_sessions WHERE id = 'rec-1'")).toEqual([{ n: 1 }]);
      expect(await db.all("SELECT COUNT(*) AS n FROM raw_samples WHERE session_id = 'rec-1'")).toEqual([{ n: 25 }]);
      expect(await db.all("SELECT COUNT(*) AS n FROM rep_events WHERE session_id = 'rec-1'")).toEqual([{ n: 3 }]);
    });
  });

  it('10. naming: no table or column renamed; new columns carry units; identifiers are brand-free', async () => {
    const db = await v1WithData();
    const v1 = Object.fromEntries(await Promise.all(OLD_TABLES.map(async (t) => [t, await columns(db, t)] as const)));
    await migrate(db);
    for (const table of OLD_TABLES) expect((await columns(db, table)).slice(0, v1[table]!.length)).toEqual(v1[table]);
    const timeColumns = (await Promise.all(NEW_TABLES.map((t) => columns(db, t)))).flat().filter((c) => /_at$|time|start|end/.test(c));
    for (const c of timeColumns) expect(c).toMatch(/_epoch_ms$|^end_reason$/);
    const allNames = [...(await tables(db)), ...(await Promise.all(NEW_TABLES.map((t) => columns(db, t)))).flat()];
    expect(allNames.filter((n) => /repone/i.test(n))).toEqual([]);
    db.close();
  });
});
