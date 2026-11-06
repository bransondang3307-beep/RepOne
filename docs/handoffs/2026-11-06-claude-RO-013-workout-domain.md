# Handoff — RO-013 part 1: workout domain model and lifecycle

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-06 |
| **Task** | RO-013 (`TASKS.md`), part 1 of 2 ([plan](../plans/RO-013-milestone-3-plan.md) §3) |
| **Branch** | `claude/RO-013-workout-domain` (base: `main` @ `b414307`) |
| **Commits** | in the PR (this handoff is part of the first commit) |
| **Pull request** | see the PR that adds this file |
| **Status** | implemented · verified (unit tests) · ADR 0010 **proposed** |

## Objective
Start Milestone 3 while the hardware is away (owner direction, 2026-11-06): add the pure workout domain, with no
persistence yet. That means exercise and machine records and their associations, user-entered resistance with units,
and the workout and set lifecycle with full and partial rep counts per set.

## Dependencies checked
- **Open PRs:** none of them (#24–#31) touches `packages/workout-domain`, `apps/mobile/src/infrastructure/database`
  or `WorkoutSessionController`. Only PR #28 touches `application/createAppContainer.ts` and `application/index.ts`,
  and this milestone needs neither.
- **Conclusion:** Milestone 3 proceeds independently. Part 1 changes no existing export, port, table or contract.

## What changed
- **`packages/workout-domain/src/model.ts`:** the domain types listed in ADR 0010 §2.
- **`resistance.ts`:**
  - `enterResistance(value, 'kg' | 'lb')` stores kg (1 lb = 0.45359237 kg, exact) and keeps the entered unit;
  - the source is always `user_entered`; there is no "measured" in the type;
  - values must be > 0 and ≤ 1000 in the entered unit;
  - `resistanceIn` and `formatResistance` read the value back, rounded to 0.01;
  - `isValidResistance` checks a stored value.
- **`workoutLifecycle.ts`:**
  - `newMachine` and `newExercise`, with validated names;
  - `newWorkout`, `startWorkout`, `pauseWorkout`, `resumeWorkout` and `finishWorkout`, through a transition table
    that throws `WorkoutTransitionError`;
  - `addExercise`, `addSet` and `setResistance`;
  - `beginSetRecording` / `endSetRecording`: one set at a time, only while active, and pause or finish is refused
    while a set records;
  - `activeDurationMs`;
  - `summarizeSetReps`: full reps count, partials are logged;
  - `validateWorkoutRecord`, the invariants persistence will enforce.
  - Rule violations throw `WorkoutRuleError` with a stable `code`.
- **`index.ts`:** additive exports.
- **[ADR 0010](../decisions/0010-workout-domain-model.md) (Proposed):** the model, the rules, the planned persistence
  and the six plan decisions.
- **`TASKS.md`:** the RO-013 row is `in-progress`, with its section updated.

## Files changed
- `packages/workout-domain/src/{model,resistance,workoutLifecycle}.ts` — added
- `packages/workout-domain/src/index.ts` — modified (exports only)
- `packages/workout-domain/test/workoutLifecycle.test.ts` — added (22 tests)
- `docs/decisions/0010-workout-domain-model.md` — added
- `TASKS.md` — RO-013 row and section
- `docs/handoffs/2026-11-06-claude-RO-013-workout-domain.md`, `docs/handoffs/README.md` — added / index

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npx jest` in `packages/workout-domain` | 26/26 (4 existing + 22 new) |
| `npm run verify` | in the PR description (run on the final head) |

No Expo export is needed: no app code changed. Part 2 will run the Android and iOS exports.

## Decisions / ADRs
- ADR 0010 is **Proposed**. Plan decisions 1–4 follow the owner's 2026-11-06 direction. **Decisions 5 and 6 need
  confirmation:**
  - 5: pause only between sets;
  - 6: include the end reason and rep-event `source_id` in part 2.

## Known limitations / risks
- There is no persistence or UI yet. The rules are verified by unit tests only.
- `validateWorkoutRecord` is only as strong as its listed invariants. Part 2 runs it before every save, and backs the
  key ones with SQL constraints.

## Next steps
1. **Part 2** (`claude/RO-013-sqlite-persistence`, stacked on this branch):
   - repository ports and the in-memory implementation;
   - the extended contract suite;
   - migration v2 and the SQLite adapter, meeting the plan's §5 criteria;
   - the controller end reason and rep-event `source_id`;
   - history queries;
   - verify plus the Android and iOS exports.
2. **RO-014 (Milestone 4)** planning against PR #30's redesign.

## Questions for the owner
- Confirm ADR 0010 decisions 5 (pause only between sets) and 6 (store the end reason and rep-event `source_id`).
