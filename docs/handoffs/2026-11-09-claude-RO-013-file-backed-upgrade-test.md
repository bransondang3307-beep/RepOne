# Handoff — RO-013: file-backed v1 → v2 upgrade test across app launches (test only)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-09 |
| **Task** | RO-013 (Milestone 3), software coverage for plan §5 criterion 9 |
| **Branch** | `claude/RO-013-file-backed-upgrade-test`, stacked on `claude/RO-013-sqlite-persistence` ([PR #35](https://github.com/bransondang3307-beep/RepOne/pull/35) @ `26fe72a`) |
| **Pull request** | the PR that adds this file |
| **Status** | tests only; verified locally (below) |

## Objective
The owner asked (2026-11-09) for a file-backed test of the v1 → v2 upgrade that survives closing and reopening the
database, if the suite lacked one. It did:
- every test in `migrations.test.ts` uses an in-memory database;
- none closes and reopens a file, which is what the app does with `repone.db` at every launch.

## What changed
- **`__tests__/fixtures/v1History.ts`:** the v1 history from `migrations.test.ts` test 2, moved unchanged into a
  shared fixture:
  - one synthetic calibration;
  - two simulated standalone recordings labelled "Seated row (test rig)": `rec-1` with 2 full + 1 partial reps,
    `rec-2` with none.

  Test 2 now uses it, and runs unchanged.
- **`__tests__/migrations.fileBacked.test.ts`:** one test in a temporary directory, covering three launches.
  1. **Launch 1:** schema v1, the fixture history, then close.
  2. **Launch 2:** reopen and migrate to v2. The history reads the same: ids, labels, provenance and counts. Then a
     new simulated recording is made through the normal path (`WorkoutSessionController` → SQLite repositories,
     PR #36's labelled trace: 8 full + 2 partial), then close.
  3. **Launch 3:** reopen. `user_version` is 2, and migrating again changes nothing.
  4. **Checks after launch 3:**
     - both the old and new entries read back;
     - the new recording's outcome is `stream_ended`, with its `source_id`s;
     - the old one has a null outcome (unknown, not "stopped") and null `source_id`s;
     - `integrity_check` is ok and `foreign_key_check` is empty.

## Tests and checks
| Command | Result |
|---|---|
| `npx jest src/infrastructure/database/__tests__/migrations` | 14/14 (13 existing + 1 new) |
| `npx jest` (mobile) | 64/64 |
| `npx tsc --noEmit` (mobile), `npm run check:boundaries` | OK |

Node's SQLite stands in for expo-sqlite behind the same `SqlDatabase` port, so this is **not** the native iPhone
upgrade. Criterion 9's device check stays with the owner, on candidate `da4493b`.

## Next steps
Merge into PR #35's branch once it passes review; then #35 carries it into `main` after the owner's device check.
