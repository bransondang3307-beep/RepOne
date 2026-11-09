# Handoff — RO-014 PR 1: `WorkoutController`, wiring, unit and SQLite integration tests (draft)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-09 |
| **Task** | RO-014 (`TASKS.md`), Milestone 4 PR 4.1 |
| **Branch** | `claude/RO-014-workout-controller-impl`. Base: `claude/RO-014-workout-controller` (PR #37), which is stacked on PR #35 |
| **Pull request** | the draft PR that adds this file |
| **Status** | implemented and verified locally; a **draft**. It waits for PRs #29, #30 and #35 to merge. **All data synthetic** |

## Objective
Implement PR 4.1 as designed in `docs/plans/RO-014-pr1-workout-controller.md` (PR #37, Codex-clean at `fd1f674`).
That means the workout controller, its container wiring, the unit tests and the four SQLite integration tests
(T1–T4).

**Why now:** the owner said "continue on for the milestones", in reply to Claude Code's offer to write this before
the prerequisites merge. Nothing merges early.

## What changed
- **`apps/mobile/src/application/services/WorkoutController.ts`** (new): runs one workout through the ADR 0010
  lifecycle and records its sets through the recording controller.
  - Every change is one short queued step: a domain function, one save, then the in-memory record.
  - Recording is split so that `start()` never holds the queue:
    1. check and lock;
    2. start, off the queue;
    3. link;
    4. complete once.
  - The terminal snapshot is buffered until the set is linked and `start()` has settled.
  - When the completion save fails, the lock is kept until `retryPendingSave()` or the next change saves the set.
  - Stale snapshots are ignored. The session id is taken only inside this attempt's own `start()` call.
  - Resistance is prefilled from the last time, and the last unit is remembered.
  - A set left `recording` by a crash is completed on `load()`.
- **`WorkoutSessionController.isBusy()`** is now public. Only its visibility changed.
- **`createAppContainer.ts`:** `AppContainer.workouts` is wired to the same recording controller, sensor choice and
  calibration that quick sets use. Quick sets are unchanged.
- **`application/index.ts`:** exports the controller's types for PR 2's UI.
- **Tests:**
  - `WorkoutController.sqlite.test.ts`: T1, T2, T3 (a) and (b), and T4, replacing the `it.todo` entries;
  - `WorkoutController.test.ts`: 17 unit tests on in-memory repositories.
- **Docs:**
  - the plan's status and a new §6 of implementation notes, with the choices made;
  - the `TASKS.md` RO-014 row set to `in-progress`;
  - this handoff and its index row.

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm run verify` | exit 0. Boundaries OK (96 files); workflow policy OK; typecheck OK; script tests 67/67. Jest: mobile **86/86** (was 64), rep-engine 27, sensor-contracts 103, sensor-protocol 76, workout-domain 38 |
| `npx expo export --platform android` / `--platform ios` | exit 0 / exit 0 (1330 and 1184 modules) |
| Mutation checks (six defects, one at a time) | Each fails at least one test (see below); the file was restored after each |

| Mutation | Tests failing |
|---|---|
| `start()` holds the queue | 16 |
| The terminal snapshot is processed without waiting for the link | 2 |
| Any `starting` snapshot is taken as the set's | 1 |
| Memory changes before the save | 1 |
| The lock is released after a failed completion save | 2 |
| Stale snapshots are not filtered | 1 |

Environment: Node 22.22.0, a clean `npm ci`. No phone or hardware was used. Every recording in the tests is
simulated or replayed.

## Review status
- **Codex could not review `f00e016`:** the bot answered "You have reached your Codex usage limits for code
  reviews", and its state is `failed`, with no findings posted. CI at `f00e016` is green (run 42685731825).
- **Self-review before any Codex finding** (not a fix round): this commit adds three defensive paths and a test for
  the first. The paths are listed in plan §6.
- **Next:** re-request `@codex review` once the subscription's review limit resets. That costs $0 extra.

## Decisions / ADRs
None new. The plan's §6 records the implementation's choices:
- the narrow `SetRecorder` interface;
- `create()` and `load()` refused while a set records;
- `WorkoutControllerError` codes;
- when `recordSet` resolves;
- minimal crash recovery.

## Known limitations / risks
- **No UI yet:** that is PR 2 (picker, resistance entry, recording flow) and PR 3 (Today and History). Both build on
  PR #30's redesign.
- **Crash recovery** completes the set but does not change the recording row. The owner may want a different rule.
- **`defaultResistanceUnit()`** reads up to five recent workouts: no new repository query, as the plan says.

## Next steps
1. Codex review of this draft's head; at most two fix rounds on this PR.
2. **After the owner's phone checks:**
   1. merge #29, then #30, then #35;
   2. retarget and merge #37 (docs);
   3. retarget this PR to `main`, refresh it, and request a final review;
   4. merge it under the standing authorization.
3. Then PR 4.2 (picker, resistance entry, recording flow) on top of `main`.

## Questions for the owner
None blocking. Optional: confirm the crash-recovery rule (plan §6).
