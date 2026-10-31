# RO-013 — Milestone 3 implementation plan (workout domain + persistence)

- **Status:** planned. Not started; no RO-013 code exists.
- **Author:** Claude Code, 2026-10-30, at the owner's direction ("produce a concrete implementation plan, but stop
  before implementing RO-013").
- **Starts when:** RO-012 is merged (done 2026-10-31), the owner has answered the decisions in §4, and the owner says
  go (`TASKS.md`: "each starts only after the previous one is merged and the owner approves").
- **Priority:** on 2026-10-31 the owner put the real-sensor BLE pipeline (RO-029) ahead of further workout and UI
  milestones. This plan waits until then.
- **Sources:**
  - `TASKS.md` (RO-013);
  - `REPONE_SOURCE_OF_TRUTH.md` §3.1, §5 and §7;
  - [ADR 0003](../decisions/0003-full-spec-module-layout.md) §6 (full vs partial reps);
  - [ADR 0007](../decisions/0007-sensor-errors-channels-device-connections.md), the work it defers to Milestone 3;
  - the RO-011 architecture review §5.2 (contention hotspots).

## 1. Scope

**In scope** (TASKS.md RO-013, plus the ADR 0007 deferrals):
1. **The hierarchy** Workout → Exercise → Set → Reps.
2. **User-entered resistance.** It is labelled as entered and never "measured" (source of truth §1 principle 4 and
   §3.1).
3. **Machine–exercise links.**
4. **The workout lifecycle** start → pause → resume → finish, with validation.
5. **One SQLite migration**, append-only.
6. **Rep counting.** Full reps count toward a set; partial reps are logged with their label (ADR 0003 §6).
7. **Why a recording ended.** The session end reason is stored (ADR 0007 Decision 1; today the database loses it).
8. **Which sensor a rep came from.** The rep-event channel `source_id` is stored (ADR 0007 Decision 3; needed for
   multi-channel recording later).

**Out of scope:**
- any screen or UI change: dashboard, exercise selection, pause button (RO-014 / Milestone 4);
- real USB/BLE transports;
- the H0 wire format (RO-016);
- the rep-detection algorithm, thresholds and sensor units, which stay unchanged;
- machine photos and routines/planned-exercise suggestions;
- renaming `repone.db` or any existing table or column.

**Completion criteria:**
- the domain and persistence tests pass;
- the migration acceptance criteria in §5 are all met;
- `npm run verify` passes, and CI is green on Linux and Windows;
- Codex reviews the final head of each PR, with no unresolved P0–P2 findings;
- the owner merges.

## 2. Design (recommended options; see §4 for the decisions)

### 2.1 Recordings stay as they are
`workout_sessions` keeps its meaning: one continuous sensor recording, with its raw samples and rep events. It is
not renamed. A set points at its recording through `workout_sets.recording_session_id`, which is nullable so a set
can be planned before it is recorded. Everything recorded so far keeps working unchanged.

### 2.2 Domain model (`packages/workout-domain/src/`, Module D)
| Type | Fields (units in names) | Notes |
|---|---|---|
| `Machine` | `id`, `name`, `motion_type: 'rotational' \| 'linear' \| 'unknown'`, `notes`, `created_at_epoch_ms` | The detector supports rotational motion only; `linear` is recorded so the app can warn |
| `Exercise` | `id`, `name`, `created_at_epoch_ms` | |
| `ExerciseMachineLink` | `exercise_id`, `machine_id` | Many-to-many (decision 3) |
| `Workout` | `id`, `status`, `started_at_epoch_ms`, `ended_at_epoch_ms`, `pauses: {start, end}[]` | `status`: `planned` · `active` · `paused` · `finished` |
| `WorkoutExercise` | `id`, `workout_id`, `exercise_id`, `machine_id \| null`, `position` | The order within a workout |
| `WorkoutSet` | `id`, `workout_exercise_id`, `position`, `recording_session_id \| null`, `resistance \| null` | Rep counts are derived (below) |
| `Resistance` | `kg`, `entered_unit: 'kg' \| 'lb'`, `source: 'user_entered'` | No `measured` value exists in the type, the SQL CHECK or any label |

- **Lifecycle** (`workoutLifecycle.ts`). Pure functions with no I/O.
  - Allowed moves: `start` (planned → active), `pause` (active → paused), `resume` (paused → active) and
    `finish` (active or paused → finished).
  - Anything else throws `WorkoutTransitionError` with the current and requested states.
  - Rules enforced:
    - a finished workout is read-only;
    - set and exercise positions are unique;
    - pause intervals don't overlap and lie within the workout;
    - pausing is refused while a set is recording (decision 5).
  - Active duration = finish − start − the sum of the pauses.
- **Rep counts per set** are derived from the recording's `rep_events`:
  - `full_rep_count` counts toward the set;
  - `partial_rep_count` is shown as logged.

  Nothing is stored twice.
- **Provenance carries through.** A set inherits its recording's provenance. Simulated or replay sets are never
  presented as real measurements.

### 2.3 Repository ports
- **New ports:** `MachineRepository`, `ExerciseRepository`, `WorkoutRepository` and `WorkoutSetRepository`, added
  to the `Repositories` bundle.
- **Existing ports:**
  - `SessionRepository.markEnded` gains the outcome: end reason and sensor error code.
  - `RepEventRepository.append` gains the channel `source_id`.
  - These are the only changes to existing interfaces. All in-repo callers are updated in the same PR; there are no
    external implementations.
- **Shared tests.** `createInMemoryRepositories` implements everything. `describeRepositoriesContract`
  (`@repone/workout-domain/testing`) is extended, so the in-memory and SQLite implementations pass the same suite.

### 2.4 Migration v2 (`apps/mobile/src/infrastructure/database/migrations.ts`)
`MIGRATIONS[1]`, appended; `MIGRATIONS[0]` is not edited. It only adds:
- **New tables:**
  - `machines`, `exercises`, `exercise_machines`;
  - `workouts`, `workout_pauses`, `workout_exercises`;
  - `workout_sets`, with `resistance_kg REAL`, `resistance_entered_unit TEXT CHECK (… IN ('kg','lb'))` and
    `resistance_source TEXT CHECK (resistance_source IN ('user_entered'))`.
- **New columns on `workout_sessions`:**
  - `end_reason TEXT CHECK (end_reason IN ('stopped','stream_ended','sensor_error','start_failed','write_failed'))`;
  - `sensor_error_code TEXT`.
- **New column on `rep_events`:** `source_id TEXT`.
- **New columns are nullable.** Old rows keep null, which means "not recorded".
- **Foreign keys:**
  - deleting a workout cascades to its exercises, sets and pauses;
  - a set's link to its recording is `ON DELETE SET NULL`;
  - **deleting a workout never deletes a recording or its raw data.**

### 2.5 App changes (minimal, no UI)
- `WorkoutSessionController` passes the outcome it already computes (ADR 0007 Decision 1) to `markEnded`.
- Rep events are stored with the channel's `source_id`.
- `createAppContainer.ts` needs no change, because the SQLite bundle grows inside `createSqliteRepositories`.

### 2.6 ADR
A new ADR records the data model and the decisions in §4. It takes the next free number; RO-029's protocol ADR is
likely to take 0008 first. It stays **Proposed** until the owner explicitly accepts it; merging alone doesn't accept
it.

## 3. Delivery: two stacked PRs
| PR | Branch | Contents | Files |
|---|---|---|---|
| Part 1 | `claude/RO-013-workout-domain` | domain types, lifecycle, resistance, ports, in-memory implementation, extended contract suite and its tests; the data-model ADR; RO-013 row → `in-review`; handoff | `packages/workout-domain/**`, `docs/decisions/<next>-*.md`, `TASKS.md` (RO-013 row only), `docs/handoffs/…` |
| Part 2 | `claude/RO-013-sqlite-persistence` (stacked on part 1) | migration v2 and the SQLite adapter; migration tests (§5); controller end-reason and rep-event `source_id`; controller × SQLite integration test; `docs/architecture.md` modules D and E; handoff | `apps/mobile/src/infrastructure/database/**`, `apps/mobile/src/application/services/WorkoutSessionController.ts` and its tests, `docs/architecture.md`, `docs/handoffs/…` |

**Each PR:**
- `npm run verify` and CI on Linux and Windows;
- Codex review of the final head, with at most two fix rounds; after that only new P0/P1 findings come back, and
  P2/P3 findings become follow-up tasks;
- part 2 also needs the Android and iOS exports.

**Owner device check** (recommended; the criteria don't require it): an Expo Go smoke test of part 2 on the phone
that already has History. That is the real v1→v2 upgrade of `repone.db` (§5 criterion 9).

**Contention.** One branch at a time edits `migrations.ts`, `repositories.ts`, `packages/workout-domain/src/index.ts`
and `TASKS.md` (RO-011 review §5.2). No other task touching these files runs in parallel.

**Estimate.** About 1,500–2,000 lines including tests.

## 4. Owner decisions needed before starting
| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | How do sets relate to existing recordings? | (a) keep `workout_sessions` as recordings, with sets linking to them; (b) restructure or rename tables | **(a)**: additive, no data rewrite, no renames |
| 2 | What happens to existing local History rows (all simulated)? | (a) leave them as standalone recordings, not in any workout; (b) wrap them in a generated "legacy" workout | **(a)**: no invented structure; History shows them as today |
| 3 | Machine–exercise link | (a) many-to-many; (b) one machine per exercise | **(a)**: the same exercise is done on different machines and gyms (source of truth §3.1) |
| 4 | How is resistance stored? | (a) canonical `resistance_kg` plus the entered unit, source `user_entered` only; (b) the value in the entered unit only | **(a)**: units in column names, consistent comparisons; a photo source can be added later |
| 5 | When can a workout be paused? | (a) only between sets: a recording set must be stopped first; (b) also mid-set | **(a)**: a recording's samples stay continuous; mid-set pause can come later if wanted |
| 6 | Include the ADR 0007 deferrals (end reason, rep-event `source_id`) in RO-013? | (a) yes; (b) defer again | **(a)**: ADR 0007 assigned them to Milestone 3; small, additive |

## 5. Migration acceptance criteria (all must hold before part 2 merges)
1. **Fresh install.**
   - `migrate()` on an empty database reaches `user_version = 2`.
   - Every new table and column exists.
   - `PRAGMA foreign_key_check` returns nothing.
2. **Upgrade with data.**
   - Set-up: a v1 database holding calibrations, sessions, raw samples and rep events (simulated) is upgraded to v2.
   - Every existing row and value is unchanged: row counts match, and per-table content is compared before and after.
   - The new columns are null on old rows.
   - `listRecent` returns the same sessions with the same full and partial counts.
3. **Atomic.**
   - If the v2 migration fails partway (an injected failure in a test), the database stays at v1 with its data
     intact.
   - The next launch retries.
4. **Idempotent.** Running `migrate()` again on a v2 database changes nothing.
5. **Newer-schema guard.** Code that knows only v1 refuses a v2 database with the existing "newer than this app
   supports" error, and does not modify it.
6. **Append-only.** `MIGRATIONS[0]` is byte-identical to `main` before RO-013; a test pins its hash.
7. **Constraints hold.** These inserts are rejected by the database itself, not only by TypeScript:
   - a resistance source other than `user_entered` (e.g. `measured`);
   - an unknown `end_reason`;
   - a set pointing at a missing workout exercise.
8. **Deletes are safe.**
   - Deleting a workout removes its exercises, sets and pauses.
   - It never removes a recording, its raw samples or its rep events.
9. **Owner device check (recommended).** On the owner's phone with existing History, the app opens after the upgrade,
   History shows the same sets, and a new simulated set records and saves.
10. **Naming and units.**
    - No table, column or database file is renamed.
    - New columns carry units in their names (`resistance_kg`, `*_epoch_ms`).
    - New identifiers are brand-free (ADR 0006).

## 6. Risks
- **Contract change ripple.** `markEnded` and `append` gain parameters. Every implementation runs the shared
  contract suite, so a missed caller fails the tests.
- **Device database upgrade.** It is first exercised on the owner's phone (criterion 9). Back-up isn't possible from
  the app yet, and the existing data is simulated only.
- **UI scope creep.** Lifecycle and resistance have no UI until RO-014, so they are verified by tests only in this
  milestone.
