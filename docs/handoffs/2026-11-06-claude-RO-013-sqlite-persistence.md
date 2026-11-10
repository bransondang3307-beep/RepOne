# Handoff — RO-013 part 2: SQLite persistence, migration v2, history queries

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-06 |
| **Task** | RO-013 (`TASKS.md`), part 2 of 2 ([plan](../plans/RO-013-milestone-3-plan.md) §3) |
| **Branch** | `claude/RO-013-sqlite-persistence`, stacked on `claude/RO-013-workout-domain` ([PR #33](https://github.com/bransondang3307-beep/RepOne/pull/33)) |
| **Commits** | in the PR |
| **Pull request** | [PR #35](https://github.com/bransondang3307-beep/RepOne/pull/35) (base: `claude/RO-013-workout-domain`); includes [PR #36](https://github.com/bransondang3307-beep/RepOne/pull/36) |
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
| `npm run verify` at `420df7e` (Node 22.22.0, clean `npm ci`) | exit 0. Boundaries OK (80 files, no cycles). Workflow policy OK. Typecheck OK. Script tests 62/62. Jest 231/231: mobile 63, rep-engine 27, sensor-contracts 103, workout-domain 38 |
| `WorkoutSessionController.sqlite.test.ts` at `420df7e` (includes PR #36) | 3/3, including *"reads a recorded workout, its set, and its last entered resistance from SQLite history"* |
| Android and iOS `npx expo export` | in the PR's final-head comment |

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

## Integration regression (PR #36, Codex)
PR #36 was merged into this branch at `420df7e`, so its coverage is part of this delivery. It runs the labelled
synthetic trace through the real `WorkoutSessionController` and Node SQLite, links the recording to a workout set,
and reads it back through the history queries:
- workout totals and per-set full/partial counts;
- simulated provenance;
- the stored end reason;
- the channel `source_id`s;
- the last user-entered resistance, 100 lb.

Its handoff: [`2026-11-07-codex-RO-013.md`](2026-11-07-codex-RO-013.md). Node SQLite exercises the shared database
port, not the native iPhone upgrade (criterion 9).

## Owner device check (criterion 9)
The App Store's Expo Go opens only SDK 58 projects, and this branch is on SDK 57. The check therefore runs on a
**combined candidate**: this branch merged with PR #30's head `4f847cf` (the redesign, which includes PR #29's
SDK 58). It is branch `claude/RO-013-m3-phone-candidate`; its exact SHA is posted on PR #35.
1. **Before the upgrade:** open PR #30's head in Expo Go and make sure History has at least one set.
2. **The upgrade:** open the candidate. The first launch runs migration v2.
3. **Old sets survive:** History and Today show the same sets as before, with the same counts and badges.
4. **New set:** record and save one simulated set. It appears in History.
5. **Persistence:** force-quit Expo Go and reopen the candidate. Every set is still there.
6. **Do not go back:** after the upgrade, any schema-v1 build (`main` today, PR #30 alone) stops at "Could not open
   local storage: Database schema v2 is newer than this app supports (v1)". That is the newer-schema guard working.
   So run PR #30's own acceptance check **before** step 2.

## Next steps
1. **Owner device check:** the section above.
2. **Milestone 4 (RO-014):** UI for exercise selection, workouts and resistance entry, on PR #30's design.

## Review round 1 (Codex, reviewed `08b4b93`)
- **[P1] `createSqliteRepositories.ts:434`, serialize aggregate reads with workout writes.** **Valid; fixed.**
  - The defect: reads bypassed the write queue on the shared connection. A `getById` or `listSetResults` issued
    during `save()` saw the workout with its children deleted but not yet re-inserted.
  - The fix: every repository operation, reads included, now runs on one queue at the boundary
    (`createSqliteRepositories` wraps the unqueued repositories). Inner methods never call queued ones.
  - Regression test: an instrumented database pauses the save right after the deletes, and reads are issued during
    the pause. On `08b4b93` `getById` returned empty `exercises` and `sets`; now the reads wait for the whole save.
- Also on this branch: part 1's round-1 fix (timestamp validation, `a4b3152`), brought in by a merge (`d4215b9`).
- Fix commit, verify, the exports and CI: in the PR's round-1 summary comment.

## Questions for the owner
- Confirm ADR 0010 decisions 5 and 6.
