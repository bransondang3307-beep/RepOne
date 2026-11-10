# Handoff — RO-014 PR 4.3: Today's workout cards and History's workouts (draft)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-09 |
| **Task** | RO-014 (`TASKS.md`), Milestone 4 PR 4.3 |
| **Branch** | `claude/RO-014-pr3-history`. Base: `claude/RO-014-pr2-workout-flow` (PR 4.2) @ `ff0d295` |
| **Pull request** | the draft PR that adds this file |
| **Status** | implemented and verified locally; a **draft**. It waits for PR 4.2, PRs #29, #30 and #35, and the owner's Expo Go check in light and dark. **All data synthetic** |

## Objective
Build PR 4.3 of `docs/plans/RO-014-milestone-4-plan.md` §1 items 4–5:
- **Today** shows the current workout and recent workouts;
- **History** lists workouts with their totals and, in detail, each set: reps counted (full) and listed (partial),
  resistance "entered", and provenance;
- standalone recordings made before Milestone 3 stay listed as before.

## What changed
- **`features/workouts/workoutList.ts`** (`loadWorkoutList`, `leastRealProvenance`) and **`useWorkoutList.ts`**: recent
  workouts read from storage only, reloaded on focus. Each workout carries:
  - its summary (`workouts.listRecent`);
  - its exercise names;
  - each set with the exercise title, its number, its `SetResult` and its stored outcome;
  - the least real provenance among its recorded sets: a total that includes simulated data is labelled simulated.
- **`components/WorkoutCard.tsx`:**
  - collapsed: the exercises, date and active time (or status), "N of M sets recorded · full · partial", and the
    provenance badge;
  - expanded: each set with "100 lb entered", its reps, its provenance badge and why it ended early, if it did;
  - the spoken label always carries the provenance.
- **`shared/components/SegmentedControl.tsx`**: two views of one list.
- **History (`app/history.tsx`)** has a "Workouts | All sets" switch.
  - **Workouts:** workout cards; tap one to see its sets.
  - **All sets:** the existing per-day list of every recording, unchanged. Standalone quick sets and pre-Milestone 3
    recordings stay listed there.
  - The default view is Workouts when there are any, otherwise All sets.
- **Today (`app/index.tsx`)**:
  - a "Current workout" card above "Continue workout" while one is open;
  - "Recent workouts" (the last two finished ones) with "See all".

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm run verify` | exit 0. Boundaries OK (137 files); workflow policy OK; typecheck OK; script tests 124/124. Jest: mobile **164/164** (PR 4.2: 154), rep-engine 27, sensor-contracts 103, sensor-protocol 76, workout-domain 38 |
| `npx expo export --platform android` / `ios` | exit 0 / exit 0 (1370 and 1375 modules) |
| React warnings in the new tests | none |

**New tests (10):** `workoutList.test.tsx`, built from a real history stored through `WorkoutController` and the
recording controller: a standalone quick set, a finished workout with a replayed set and a sensor-failure set, and an
open workout.
- `loadWorkoutList`: order, statuses, totals, set titles and numbers, outcomes and provenance. The quick set is not
  a workout and is still a recording.
- The least-real-provenance rule.
- In light and dark:
  - `WorkoutCard` collapsed, expanded and open, with provenance in the spoken label;
  - `SegmentedControl`.

## Review round 1 (Codex at `a244d37`, 2026-11-10)
- **P1:** a set still recording adds its saved rep events to the workout's totals, but the totals' provenance came
  from completed sets only. Totals seen while recording could show without the simulated-data label.
  - **Fix:** provenance now comes from every set with a recording, so a set still recording counts.
  - **Display:** the expanded card shows that set as "recording: … so far".
  - **Test:** a workout whose set is still recording has non-zero totals labelled `simulated`.
- **P2:** no test went through the History screen.
  - **Test:** `historyScreen.test.tsx` mounts `app/history.tsx`, with `expo-router`'s focus effect mocked. It is built
    from a workout, a standalone quick set and a recording saved without an outcome (as before Milestone 3).
  - **Checks:** Workouts is the default and shows the workout card with its provenance. Switching to All sets lists
    all three recordings, each with its provenance. Run in light and dark.
- **Proof the tests catch it:** the completed-only provenance filter fails the new P1 test; a view switch that does
  nothing fails the History test.
- **Results:** verify exit 0; Android and iOS exports exit 0.

## Decisions / ADRs
None new. The History switch keeps the old list intact as "All sets", rather than mixing two kinds of rows.

## Known limitations / risks
- **Owner check:** the Expo Go check (plan §4 items 4, 5 and 7, in light and dark) needs PRs #29, #30 and #35 merged.
- **Query cost:** `loadWorkoutList` reads each listed workout's sets and outcomes: up to 20 workouts on History and 4
  on Today. A combined query is a later change if it proves slow.

## Next steps
1. Codex reviews of #45, #46 and this PR once the review limit resets.
2. **After the phone checks:**
   1. merge #29 → #30 → #35 → #37 → #45 → #46 → this PR, each retargeted to `main` and refreshed;
   2. the owner runs the Milestone 4 acceptance in Expo Go (plan §4);
   3. the Milestone 4 closeout.
3. Then Milestone 5 (RO-015), once the owner authorizes it.

## Questions for the owner
None blocking.
