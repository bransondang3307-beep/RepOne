# Handoff — RO-013 part 2: SQLite persistence, migration v2, history queries

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-06 |
| **Task** | RO-013 (`TASKS.md`), part 2 of 2 ([plan](../plans/RO-013-milestone-3-plan.md) §3) |
| **Branch** | `claude/RO-013-sqlite-persistence`, stacked on `claude/RO-013-workout-domain` ([PR #33](https://github.com/bransondang3307-beep/RepOne/pull/33)) |
| **Commits** | in the PR |
| **Pull request** | see the PR that adds this file (base: `claude/RO-013-workout-domain`) |
| **Status** | implemented · verified (tests, exports) · ADR 0010 **proposed** |

## Objective
Persist the Milestone 3 domain locally:
- exercises, machines and their links;
- workouts with pauses, exercises and sets, and user-entered resistance;
- full and partial rep counts per set, from the sets' recordings;
- history queries;
- the recording outcome and the rep-event channel, deferred from ADR 0007.

Existing saved data must be preserved, and the sensor contracts must stay compatible.

## What changed
- **`@repone/workout-domain` ports (`repositories.ts`):**
  - `MachineRepository`, `ExerciseRepository` (with link and unlink) and `WorkoutRepository` (aggregate `save`,
    `getById`, `listRecent`, `listSetResults`, `listExerciseHistory`, `delete`), added to `Repositories`;
  - `SessionOutcome` / `SessionEndReason`;
  - `markEnded(…, outcome?)` with `getOutcome`;
  - `repEvents.append(event, sourceId?)` with `listSourceIdsBySession`.
  - Every change to an existing port is optional, and `WorkoutSession` is unchanged (PR #30 builds these objects in
    its tests).
- **In-memory implementation:** all of the above, validating with `validateWorkoutRecord` and checking references.
  It stores records in canonical order and avoids `structuredClone`, which is not in every runtime.
- **Shared contract suite:** 10 new tests that both the in-memory and SQLite implementations pass.
- **Migration v2 (`migrations.ts`):** appended; `MIGRATIONS[0]` is untouched and pinned by hash. Table and
  constraint details are in ADR 0010 §4. `migrate(db, migrations?)` takes an optional list, for tests.
- **SQLite adapter (`createSqliteRepositories.ts`):**
  - every repository above, with upserts (never `INSERT OR REPLACE`, which would cascade);
  - an atomic aggregate save;
  - SQL history queries;
  - **all writes serialized** through one queue, because expo-sqlite transactions are not exclusive.
- **`WorkoutSessionController`:**
  - stores the outcome (`stopped` / `stream_ended` / `sensor_error` / `start_failed` / `write_failed` plus the error
    code), decided when the `markEnded` write runs;
  - a late start failure after a stop replaces `stopped` and keeps the end time;
  - rep events are stored with the sensor's `source_id`.
- **ADR 0010 §4:** what was implemented, the deviations and why, and the known edge.

## Files changed
- `packages/workout-domain/src/repositories.ts`, `src/index.ts`, `src/memory/createInMemoryRepositories.ts`,
  `src/testing/repositoriesContract.ts` — modified
- `apps/mobile/src/infrastructure/database/migrations.ts`, `createSqliteRepositories.ts` — modified
- `apps/mobile/src/infrastructure/database/__tests__/migrations.test.ts` — added
- `apps/mobile/src/application/services/WorkoutSessionController.ts` — modified
- `apps/mobile/src/application/services/__tests__/WorkoutSessionController.outcome.test.ts` — added
- `docs/decisions/0010-workout-domain-model.md`, `TASKS.md`, `docs/handoffs/README.md`, this handoff

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npx jest src/application src/infrastructure/database` (mobile) | 52/52 |
| `npm run verify`, Android and iOS `npx expo export` | in the PR description (run on the final head) |

**Migration criteria (plan §5) and their tests**, all in `migrations.test.ts`:
1. fresh install;
2. upgrade with data: every v1 row and value is unchanged, the new columns are null, and history reads the same;
3. atomic: a failure partway stays at v1, and a retry succeeds;
4. idempotent;
5. the newer-schema guard;
6. append-only (hash pin);
7. database-level constraints: `measured`, a non-positive value, an unknown unit, a half-filled resistance, an
   unknown end reason, a missing workout exercise, an unknown status;
8. deletes never remove recordings (also in the contract suite);
9. **not run:** the owner's device check (below);
10. naming: no renames, units in names, brand-free.

## Decisions / ADRs
- ADR 0010 is **Proposed**. It still needs confirmation of decisions 5 (pause only between sets) and 6 (store the end
  reason and `source_id`, implemented here).

## Known limitations / risks
- **No UI** reads or writes workouts yet; that is Milestone 4 (RO-014).
- **A deleted recording** would leave its set `completed` with no recording, which fails re-validation (ADR 0010
  §4). The app cannot delete recordings today.
- **The device upgrade is untested** on a real `repone.db` (criterion 9). The existing data is simulated only.

## Next steps
1. **Owner device check (recommended):** install the part 2 build on the phone that already has History. Open the
   app (this runs the upgrade), confirm History shows the same sets, then record one simulated set.
2. **Milestone 4 (RO-014):** UI for exercise selection, workouts and resistance entry, on PR #30's design.

## Questions for the owner
- Confirm ADR 0010 decisions 5 and 6.
