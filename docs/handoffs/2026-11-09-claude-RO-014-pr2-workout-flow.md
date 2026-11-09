# Handoff — RO-014 PR 4.2: workout flow UI (picker, resistance entry, recording flow) — draft

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-09 |
| **Task** | RO-014 (`TASKS.md`), Milestone 4 PR 4.2 |
| **Branch** | `claude/RO-014-pr2-workout-flow`. Base: `claude/RO-014-m4-integration` @ `b82eae0` |
| **Pull request** | the draft PR that adds this file |
| **Status** | implemented and verified locally; a **draft**. It waits for PRs #29, #30 and #35 and the owner's Expo Go check. **All data synthetic** |

## Objective
Build PR 4.2 of `docs/plans/RO-014-milestone-4-plan.md`:
- the exercise and machine picker, with the linear-machine warning;
- resistance entry, labelled "entered" and prefilled from last time;
- the workout screen: start → add exercises and sets → record a set → pause and resume between sets → finish.

**Why now:** the owner said "keep going on the milestones". Nothing merges early.

## The base branch
PR 4.2 needs two things on separate PR stacks: PR #30's redesign (with #29) and PR #45's controller (with #37 and
#35). `claude/RO-014-m4-integration` (`b82eae0`, no PR) is `main` @ `4986606` merged with:
- #29 @ `4cff3ca`;
- #30 @ `4f847cf`;
- #45 @ `fda0d2f`.

Only the docs indexes conflicted (`TASKS.md`, the handoff index), and rows from both sides were kept. Compared with
the 2026-11-09 rehearsal (`63118e6`), its app code differs only by #40's tests and #45's controller, and the
lockfile is the same.

Base checks: a clean `npm ci`, then `npm run verify` exit 0 (mobile Jest 136/136, script tests 124/124), and Android
and iOS `expo export` exit 0.

## What changed
- **`features/workouts/workoutStore.ts` + `useWorkout.ts`:** a thin Zustand adapter over `WorkoutController`, in the
  pattern of `liveSessionStore`. It keeps:
  - the controller's snapshot;
  - the recording controller's live snapshot, for the running set's counts (features may not import each other);
  - the exercise catalog and machine names;
  - "last time" per exercise, from earlier workouts only;
  - each completed set's stored outcome;
  - the last resistance unit (decision 2).

  A refusal from the domain or the controller becomes a message on screen.
- **`components/ResistanceInput.tsx`:**
  - kg/lb entry labelled "Resistance · entered", with "Last time: 100 lb";
  - commits only a valid weight (above 0, up to 1000; comma or dot), and does not re-save an unchanged value.
- **`components/ExercisePicker.tsx`:**
  - pick an existing exercise and one of its machines, or create an exercise with an optional machine and motion type;
  - "Rep counting supports rotating machines only" is shown for a linear machine, new or existing.
- **`components/SetRow.tsx`:**
  - a set's entered resistance and status;
  - live counts while it records;
  - when completed, its full and partial reps, the provenance badge and, after a sensor error, why it ended early,
    with the saved reps kept (decision 1).
- **`screens/WorkoutScreen.tsx` + `app/workout.tsx`:**
  - the workout flow;
  - Pause and Finish are disabled while a set records, with the reason shown;
  - a paused workout must be resumed to record;
  - a finished workout is read-only.
- **Today** gains "Start a workout" / "Continue workout" (decision 3: workouts start from Today).
- **The tab bar stays at three tabs:** `TabBar` gains `hiddenRoutes`, and the workout route shows Today as selected.

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm run verify` | exit 0. Boundaries OK (132 files); workflow policy OK; typecheck OK; script tests 124/124. Jest: mobile **154/154** (base 136), rep-engine 27, sensor-contracts 103, sensor-protocol 76, workout-domain 38 |
| `npx expo export --platform android` / `ios` | exit 0 / exit 0 (1366 and 1371 modules) |
| React warnings in the new tests | none (`not wrapped in act`, `Warning:`: 0) |

**New tests (18):**
- `workoutStore.test.ts` (4): over the app's real composition and the simulated device (`ManualScheduler`):
  - a whole workout, with the refusals while recording;
  - prefill and "last time" across workouts;
  - reopening an unfinished workout;
  - an invalid name shown as a message.
- `workoutFlow.test.tsx` (12):
  - parsing and the early-end text;
  - in light and dark: ResistanceInput, ExercisePicker's linear warning, SetRow's completed state;
  - the end-to-end `WorkoutScreen` flow with the simulated sensor.
- `TabBar.test.tsx` (2): the hidden route.

No phone or hardware was used; every recording is simulated.

## Decisions / ADRs
None new. Choices within the plan:
- the workout route is a hidden tab rather than a stack, so PR #30's tab bar is unchanged;
- PR 4.2 adds only a Today button; PR 4.3 adds the dashboard cards and History.

## Known limitations / risks
- **The owner's Expo Go check** (plan §4 items 1–3, 5 and 6) is needed after #29, #30 and #35 merge.
- **History** shows the workout's sets as today's standalone list until PR 4.3.
- **No delete or reorder** for exercises and sets (not in the plan).

## Next steps
1. A Codex review once its limit resets, then CI on the head.
2. PR 4.3: Today's workout cards and History (workout list and detail; standalone recordings kept).
3. **After the phone checks:**
   1. merge #29 → #30 → #35 → #37 → #45;
   2. retarget this PR to `main` and refresh it;
   3. the owner checks it in Expo Go;
   4. merge.

## Questions for the owner
None blocking.
