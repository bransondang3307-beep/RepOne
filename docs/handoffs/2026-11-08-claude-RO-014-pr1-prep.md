# Handoff — RO-014 PR 1 (prep): WorkoutController design and integration-test definitions

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-08 |
| **Task** | RO-014 (`TASKS.md`), PR 4.1 of [the Milestone 4 plan](../plans/RO-014-milestone-4-plan.md) |
| **Branch** | `claude/RO-014-workout-controller`, stacked on `claude/RO-013-sqlite-persistence` ([PR #35](https://github.com/bransondang3307-beep/RepOne/pull/35)) |
| **Pull request** | the draft PR that adds this file |
| **Status** | **prepared; not implemented.** Design and named tests only |

## Objective
Make Milestone 4's first PR ready to implement the moment its prerequisites merge, as the owner asked on
2026-11-08:
- map the `WorkoutController` to #35's actual repository APIs and to the existing recording controller;
- define the integration tests for normal completion, a sensor failure with saved reps, and refusing to pause during
  a recording;
- start from #36's synthetic recording-to-history test.

## What changed
- **`docs/plans/RO-014-pr1-workout-controller.md`:**
  - the API mapping table (domain functions from #33, repositories from #35, the recording controller);
  - the set-recording sequence, including the lock that refuses a pause while a set is starting, recording or
    stopping;
  - the start-failure and crash-recovery cases;
  - the three integration tests, with their setup and expected results;
  - the done criteria.
- **`apps/mobile/src/infrastructure/database/__tests__/WorkoutController.sqlite.test.ts`:** the three tests as
  `it.todo`, to be implemented on this branch.

## Tests and checks
- **No production code:** `it.todo` entries only, so the suite reports them as todo.
- **CI:** results on the PR.

## Decisions / ADRs
It follows ADR 0010 (Accepted) and the plan's §5 decisions, which the owner approved on 2026-11-08:
- a sensor-error set counts as completed;
- the last resistance unit is remembered;
- workouts start from Today;
- quick sets stay.

**Interpretation for review:** a start failure whose recording row exists is linked and completed with
`start_failed` (decision 1, applied uniformly). One whose row does not exist leaves the set planned.

## Known limitations / risks
- **Implementation waits for prerequisites:**
  - PR #35, which needs the owner's device check;
  - PRs #29 and #30, which need the owner's phone check.
- **Crash recovery** for a set left `recording` is an open point for PR 1's review (plan §3).

## Next steps
1. When #35 merges, retarget this PR to `main`.
2. When #29 and #30 merge, implement the controller, wiring and tests, then run verify, the exports, CI and a
   Codex review.
