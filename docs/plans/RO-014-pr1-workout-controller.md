# RO-014 PR 1 — `WorkoutController`: design and integration-test definitions

- **Status:** **prepared, not implemented.** This PR holds the design and the named integration tests (`it.todo`).
  The code is written on this branch once the prerequisites below merge.
- **Plan:** [`RO-014-milestone-4-plan.md`](RO-014-milestone-4-plan.md) §3 (PR 4.1). §5's decisions were approved by the
  owner on 2026-11-08.
- **Prerequisites:**
  - [PR #35](https://github.com/bransondang3307-beep/RepOne/pull/35) (Milestone 3 part 2), which still needs the
    owner's device check;
  - PRs #29 (SDK 58) and #30 (redesign), which still need the owner's phone check.

  This branch is stacked on #35. It is retargeted to `main` once #35 merges.
- **Builds on:**
  - [ADR 0010](../decisions/0010-workout-domain-model.md) (Accepted): the domain model and lifecycle rules;
  - #35's repository ports;
  - the existing recording controller, `WorkoutSessionController`;
  - #36's recording-to-history test.

## 1. What PR 1 delivers

**Code:**
- **`apps/mobile/src/application/services/WorkoutController.ts`:** an application service that runs one workout
  through the ADR 0010 lifecycle and records its sets through the existing recording controller.
- **Container wiring:** `AppContainer.workouts`.

**Tests:**
- unit tests on in-memory repositories;
- the three SQLite integration tests in §4.

**No UI:** the picker and workout screen are PR 2; the dashboard and History are PR 3.

**Quick sets stay exactly as they are** (decision 4):
- `liveSessionStore.startSet` keeps calling the recording controller directly;
- its recordings stay standalone: they are linked to no set.

## 2. Mapping to the actual APIs

`WorkoutController` keeps the current `WorkoutRecord` in memory and persists it after every change. The domain
functions (`@repone/workout-domain`, ADR 0010) enforce the rules; the controller only sequences them.

| `WorkoutController` | Domain function (#33) | Repository call (#35) | Recording controller |
|---|---|---|---|
| `createExercise(name, machine?)` | `newExercise`, `newMachine` | `exercises.save`, `machines.save`, `exercises.link` | — |
| `listExercises()` / `machinesFor(id)` | — | `exercises.list`, `exercises.machinesFor` | — |
| `create()` | `newWorkout(id, now)` | `workouts.save(record)` | — |
| `addExercise(exerciseId, machineId?)` | `addExercise` | `workouts.save` | — |
| `addSet(workoutExerciseId)` | `addSet`; resistance prefilled from the last time | `workouts.listExerciseHistory(exerciseId, 1)` → `.resistance`; `workouts.save` | — |
| `setResistance(setId, value, unit)` | `enterResistance`, `setResistance` | `workouts.save` | — |
| `defaultResistanceUnit()` (decision 2) | — | `workouts.listRecent(5)` → `getById` → the newest set with a resistance → its `entered_unit`; `'kg'` if none | — |
| `start()` | `startWorkout` | `workouts.save` | — |
| `pause()` / `resume()` (decision 5) | `pauseWorkout` / `resumeWorkout` | `workouts.save` | refused while a set is starting, recording or stopping (§3) |
| `recordSet(setId)` | `beginSetRecording`, after the recording exists | `workouts.save` | `start({ sensor, calibration, machineLabel })` |
| `stopSet()` | — | — | `stop()` |
| (the recording settles) | `endSetRecording` | `workouts.save`; `workouts.listSetResults`; `sessions.getOutcome` | `subscribe` → `finished` / `error` |
| `finish()` | `finishWorkout` | `workouts.save` | refused while a set is recording |
| `load(workoutId)` / `resumeLatest()` | — | `workouts.getById`, `workouts.listRecent` | — |

- **Sensor and calibration:** the same `getSessionSensor()` and `getCalibration()` that quick sets use, so a set uses
  whichever sensor the user chose (simulated or real).
- **`machineLabel`:** "<exercise> · <machine>". Standalone views of the recording then stay readable.
- **No new repository methods.** `defaultResistanceUnit` reads existing queries. If profiling shows it is slow, a
  dedicated query is a later change.

## 3. The set-recording sequence

`WorkoutRepository.save` refuses a set whose `recording_session_id` does not exist yet. The recording controller
creates that row inside `start()`. So the set can be linked only after `start()` resolves; #36's test does the same.
Pausing (decision 5) must nevertheless be refused for the whole recording, not only once the link is saved.

1. **Check, then lock.** Check the rules first, by running `beginSetRecording` on a copy of the record with a
   placeholder id:
   - the workout must be active;
   - the set must be planned;
   - no other set may be recording.

   If the recording controller is busy (a quick set), refuse: "Finish the quick set first."

   Then set the controller's lock: `recordingSetId = setId`. From this moment, `pause()` and `finish()` throw
   `WorkoutRuleError('set_recording')`, the same code as the domain's own check.
2. **Open a recording attempt, then start** (Codex P2 on PR #37). The attempt is
   `{ setId, sessionId: null, terminal: null, linked: false, completed: false }`, and the controller subscribes to
   the recording controller before calling `start()`.
   - **The session id comes from the snapshot, not from `start()`.** `WorkoutSessionController.start()` publishes
     `{ status: 'starting', sessionId }` synchronously, before its first `await`. The subscriber records that id in
     the attempt. No other recording can start in between, because the recording controller refuses a second
     session while one is busy.
   - **A terminal snapshot is buffered, never dropped or processed early.** A `finished` or `error` snapshot whose
     `sessionId` equals the attempt's is stored in `attempt.terminal`. It can arrive before `start()` resolves: for
     example a short replay, or a sensor that ends during `start()`. Snapshots for any other session id are ignored.
3. **Link the set:** `await recorder.start(...)`, then `beginSetRecording(record, setId, attempt.sessionId)`, then
   save, then set `attempt.linked = true`.
4. **Complete exactly once.** `completeOnce()` runs when **both** `attempt.linked` and `attempt.terminal` are set,
   whichever comes last, and only if `attempt.completed` is false. In order, it:
   - calls `endSetRecording(record, setId)`;
   - saves;
   - refreshes `listSetResults` and reads `sessions.getOutcome`;
   - releases the lock (`recordingSetId = null`);
   - resolves the attempt's **workout-level** completion (§3a).
5. **Sensor error during the set** (decision 1): the same path as step 4.
   - The set is **completed**.
   - Its reps are the ones saved before the failure (`listSetResults`).
   - The reason comes from `sessions.getOutcome(sessionId)`, for example `{ end_reason: 'sensor_error',
     sensor_error_code: 'connection_lost' }`, together with the recording controller's message.
   - Re-recording means adding a new set.
6. **Start failure:** `start()` rejects. The recording controller publishes its terminal `error` snapshot before the
   rejection, so it is already in `attempt.terminal`.
   - If the recording row exists (`sessions.getById(attempt.sessionId)` is non-null), apply decision 1 uniformly:
     link it (step 3), then `completeOnce()` (step 4). The set completes with outcome `start_failed` and 0 reps, and
     no orphan recording is left in History.
   - If the row does not exist (the failure came before `sessions.create`), the set stays planned and the error is
     shown.
   - In both cases, release the lock.
7. **Save failure** after the recording ends: the recording itself is already stored. The set keeps `recording` in
   memory, the error is shown, and the save is retried by the next action.

### 3a. Workout-level completion, the signal callers and tests wait for (Codex P2 on PR #37)

`recordSet(setId)` returns `{ sessionId, settled }`. `settled` is a `Promise<SettledSet>`, where `SettledSet` holds:
- the set as saved;
- its `SetResult` (reps and provenance);
- its `SessionOutcome`;
- the recording controller's error message, or null.

`settled` resolves only after `completeOnce()` has saved the completed set, refreshed the results and released the
lock. The recording controller's own `finished` / `error` snapshot is **not** that signal: it comes earlier, while the
workout is still mid-update. The controller's snapshot also exposes the same moment as `recordingSetId === null` with
the refreshed results, for the UI. If the post-recording save fails, `settled` rejects with that error and the lock is
kept (step 7).

**Open point for review:** a set left `recording` by an app crash. On `load`:
- if the linked recording has `ended_at_epoch_ms`, complete the set;
- if not, it was cut off mid-recording: complete the set and show "recording interrupted".

The recording keeps what was saved.

## 4. Integration tests (SQLite)

**File:** `apps/mobile/src/infrastructure/database/__tests__/WorkoutController.sqlite.test.ts`, added in this PR as
`it.todo`.

**Harness:** the one in #36's `WorkoutSessionController.sqlite.test.ts`:
- `openNodeSqliteDatabase` + `migrate`;
- `createSqliteRepositories`;
- a recording controller with a step clock and `RotationalRepDetector`;
- `createSyntheticCalibration(0)`.

**What the tests wait for:** every post-recording assertion and action waits for the **workout-level** `settled`
promise that `recordSet` returns (§3a). #36's recorder-level `settled` helper resolves before the controller has
saved the set and released its lock, so it is not used for that.

**Fixtures:** "Row" on "Seated row" (rotational), and a set at 100 lb.

| # | Test | Setup | Expected |
|---|---|---|---|
| 1 | **Normal completion:** a recorded set completes and reads back through history | `ReplaySensorSource` over `LABELLED_SET_SCRIPT` (8 full + 2 partial, synthetic). `create`, `addExercise`, `addSet` (100 lb), `start`, `recordSet`, await its workout-level `settled`, then `finish` | The set is `completed` and linked to the recording. `listSetResults`: 8 full, 2 partial, provenance `simulated`. `getOutcome`: `stream_ended`. `listRecent`: `completed_set_count` 1, workout `finished`. `listExerciseHistory('row', 1)`: 100 lb (shown as "100 lb"). A new workout's `addSet` for Row prefills 100 lb, and `defaultResistanceUnit()` is `lb` |
| 2 | **Sensor failure with saved reps:** the set completes with the reason and the reps saved (decision 1) | `SimulatedSensorSource` over `LABELLED_SET_SCRIPT` with `fault: { afterSamples: N, code: 'connection_lost' }`. N is chosen at implementation so that at least one rep is detected first. `recordSet`, advance the scheduler, then await the workout-level `settled` | The set is `completed`. `listSetResults` shows full + partial = the rep events stored for the recording, and more than 0. `getOutcome`: `{ end_reason: 'sensor_error', sensor_error_code: 'connection_lost' }`. The workout is still `active`. A new set can be added and recorded (re-recording adds a set) |
| 3 | **No pause during a recording** (decision 5) | Two windows: (a) while `start()` is pending, using a deferred-start sensor like `DeferredStartSensor` in `WorkoutSessionController.outcome.test.ts`; (b) while recording, using `SimulatedSensorSource` with a `ManualScheduler` | In both windows, `pause()` and `finish()` reject with `WorkoutRuleError` code `set_recording`, and the stored workout stays `active` with no pauses. After `stopSet()` and the workout-level `settled`, `pause()` succeeds (stored `paused`, one open pause), and `resume()` returns it to `active` |
| 4 | **A recording that settles before `start()` resolves** completes the set exactly once, after the link is saved (Codex P2 on PR #37) | A sensor whose `start()` delivers its samples and publishes `stopped` before it resolves, so the recording controller publishes `finished` while `start()` is still pending | The terminal snapshot is buffered: no `set_not_recording` error, and nothing is dropped. The set is linked, then completed **once** (one save of the completed set). `settled` resolves with the set's reps and `stream_ended`, and the lock is released |

**Also in PR 1, as unit tests on in-memory repositories:**
- a quick set (recording controller only) stays standalone, and `recordSet` refuses while one runs;
- the two start-failure cases of §3 step 6;
- every refusal leaves the stored record unchanged.

## 5. Done when

- The `it.todo` entries are implemented and pass.
- `npm run verify` and both platforms' `expo export` pass.
- CI is green on Linux and Windows.
- A Codex review of the final head has no unresolved P0–P2 findings (at most two fix rounds).
- The PR is retargeted to `main` after #35 merges, and merged by the owner's standing authorization.
- Quick-set behaviour is unchanged: the existing `liveSessionStore` tests still pass.
