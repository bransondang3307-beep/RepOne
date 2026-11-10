# RO-014 — Milestone 4 plan (mobile UI for workouts)

- **Status:** in progress as **drafts** (2026-11-09). Nothing is merged until PRs #29, #30 and #35 merge and the
  owner checks each UI PR in Expo Go.
  - PR 4.1: the design is in #37; the code and tests are in #45.
  - PR 4.2: the workout flow, in a draft PR stacked on `claude/RO-014-m4-integration`. That branch is `main` + #29 +
    #30 + #45, built so the UI can use both the redesign and the controller.
  - PR 4.3: Today's workout cards and History's workouts, in a draft PR stacked on PR 4.2.
- **Author:** Claude Code, 2026-11-06, at the owner's direction ("continue Milestone 4 planning based on the existing
  UI redesign in PR #30").
- **Starts when** all of these are true:
  - PR #29 (Expo SDK 58) and PR #30 (UI redesign) are merged;
  - Milestone 3 is merged: [PR #33](https://github.com/bransondang3307-beep/RepOne/pull/33) and its stacked part 2;
  - the owner has answered §5 (done: approved 2026-11-08) and says go.

  `TASKS.md`: "each starts only after the previous one is merged and the owner approves".
- **Sources:**
  - `TASKS.md` RO-014: home dashboard, exercise selection, pause/reset through application services;
  - [ADR 0010](../decisions/0010-workout-domain-model.md): the workout model and lifecycle;
  - PR #30's handoff (`docs/handoffs/2026-10-31-claude-RO-030-ui-redesign.md`);
  - RO-029's UI interface notes (`docs/ui/sensor-connection-interface.md`, on PR #28).

## 1. Scope

**In scope:**
1. **Exercise selection.**
   - Pick or create an exercise, and optionally a machine and its motion type.
   - The machine–exercise links come from Milestone 3.
   - Choosing a `linear` machine shows the warning "Rep counting supports rotating machines only".
2. **Workout flow.**
   - Start a workout, add exercises and sets, record a set, then pause, resume and finish.
   - The UI follows ADR 0010's rules: pause only between sets, and a finished workout is read-only.
3. **Resistance entry.**
   - A kg/lb field per set, labelled **"entered"**, never "measured".
   - It is prefilled from `listExerciseHistory` ("last time: 100 lb").
4. **Home dashboard.** PR #30's dashboard cards gain the current workout and recent workouts.
5. **History.**
   - A workout list (`workouts.listRecent`) and a workout detail (`listSetResults`): full reps counted and partials
     shown, with a provenance badge on every set.
   - Standalone recordings made before Milestone 3 stay listed as they are today.

**Out of scope:**
- changes to the rep detector, sensor contracts or BLE adapter;
- RO-024's brand configuration (no new product-name strings: ADR 0006);
- routines and suggestions, photos, cloud, AI features;
- any metric the sensor cannot support (calories, distance and the like).

## 2. Architecture

```
features/workouts (screens, hooks, Zustand store)
      ↓ hooks only
application/services/WorkoutController   ← new: orchestrates a workout
      ↓ uses
WorkoutSessionController (recordings, unchanged)  +  Repositories.workouts / exercises / machines (Milestone 3)
```

- **`WorkoutController`** (application service; no React/RN imports, injected like `WorkoutSessionController`):
  - holds the current `WorkoutRecord` and applies the pure lifecycle functions;
  - saves through `workouts.save` after every change;
  - recording a set:
    - `startSet(setId)` calls `WorkoutSessionController.start()` with the current sensor;
    - `beginSetRecording(record, setId, recordingId)` links the set to the recording;
    - when the recording finishes or errors, `endSetRecording` marks the set completed and keeps the outcome. An
      errored recording still completes the set, with its saved data and the reason shown.
  - It refuses UI actions the domain refuses, surfacing the `WorkoutRuleError` / `WorkoutTransitionError` message;
  - it publishes a snapshot for the store, as the session controller does.
- **Composition:** `createAppContainer` builds it. This is the only application-layer file change outside the new
  service.
- **UI:** built from PR #30's existing components; no new design system. Planned additions:
  - `features/workouts/screens`: workout and exercise picker;
  - `components/ResistanceInput`, `components/WorkoutCard`;
  - a route `app/workout.tsx`.

## 3. Delivery: three PRs

| PR | Contents | Verification |
|---|---|---|
| 4.1 | `WorkoutController` + tests (in-memory repositories, simulated sensor), container wiring | unit + integration tests; `npm run verify` |
| 4.2 | Exercise/machine picker, resistance input, workout screen (start → sets → pause/resume → finish) | component tests; Android/iOS `expo export`; owner Expo Go check |
| 4.3 | Dashboard and History: workout list and detail, standalone recordings kept | component tests; exports; owner Expo Go check in light and dark |

Each PR:
- needs a Codex review of the final head, with at most two fix rounds;
- needs CI green on Linux and Windows;
- is merged by the owner.

## 4. Acceptance (owner, in Expo Go, simulated sensor)
1. **Create, start and record.** Create the exercise "Row" on the machine "Seated row" (rotational). Start a
   workout, add 2 sets at 100 lb, and record set 1 with the simulated sensor. Its full and partial reps appear on the
   set, and the badge says simulated.
2. **Pause rules.** Pause is unavailable while set 1 records. After it stops, pause, resume, record set 2, then
   finish.
3. **Finished is read-only.** The workout cannot be edited after finishing.
4. **History.** History lists the workout with its rep totals, and the detail shows each set's reps, resistance
   ("entered") and provenance. Pre-Milestone 3 recordings are still listed.
5. **Prefill.** A new workout's "Row" set prefills "last time: 100 lb".
6. **Linear warning.** Choosing a `linear` machine shows the rotating-only warning.
7. **Themes.** Everything works in light and dark mode, with no red screen.

## 5. Owner decisions (approved 2026-11-08)
The owner approved all four recommendations on 2026-11-08: "Milestone 4: A set that ends in a sensor error counts as
completed and shows the error and saved reps. Remember the last resistance unit, start workouts from Today, and keep
standalone quick sets."

| # | Question | Options | Decision |
|---|---|---|---|
| 1 | What happens to a set whose recording ends in a sensor error? | (a) mark it completed, showing the reason and the reps saved; (b) leave it planned so it can be re-recorded | **(a), approved:** the data is real and saved; the reason is visible. Re-recording adds a new set |
| 2 | Default unit for resistance | (a) remember the last unit used; (b) fixed kg; (c) a settings choice | **(a), approved:** no settings screen yet |
| 3 | Where workouts start | (a) the Home dashboard; (b) a new tab | **(a), approved:** the Today dashboard; PR #30's tab bar unchanged |
| 4 | Standalone recordings (no workout) | (a) keep "quick set" recording as today; (b) every set needs a workout | **(a), approved:** quick sets stay, so nothing existing breaks |

## 6. Risks
- **Dependent PRs.** PR #29, #30, #33 and Milestone 3 part 2 must merge first. Starting earlier would mean building
  on unmerged UI and data layers.
- **Hardware.** All recording in this milestone uses the simulated or replay sensors. Real-sensor checks are in
  [`docs/acceptance/hardware-acceptance-tests.md`](../acceptance/hardware-acceptance-tests.md).
