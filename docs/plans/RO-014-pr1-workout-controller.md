# RO-014 PR 1 — `WorkoutController`: design and integration-test definitions

- **Status:** **implemented as a draft, not merged** (2026-11-09).
  - The design and test definitions are on PR #37.
  - The code and tests are on the stacked draft implementation PR; see the implementation notes in §6.
  - The owner told Claude Code to "continue on for the milestones", answering its offer to write PR 1's
    controller before the prerequisites merge.
  - Nothing merges until the prerequisites below have merged.
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

### 3b. Repeated actions, save failures and stale recording events

These rules apply wherever persisted state can change.

- **One mutation at a time.** Every step that changes the workout runs on one internal queue, as #35's SQLite
  adapter does. Each step therefore starts from the latest saved record, and saves land in call order.
- **Recording startup never holds the queue** (Codex P2, round 2 on PR #37). The queue holds only short steps: a
  domain function plus one save. `recordSet` is split into separate steps, and nothing waits on the sensor while
  holding the queue:

  | Phase | On the queue? | What it does |
  |---|---|---|
  | Check, then lock (§3 step 1) | Yes, one step | Checks the latest saved record and `isBusy()`, then sets `recordingSetId`. It does not save |
  | Attempt and `recorder.start(...)` (§3 step 2) | **No** | The queue is released before `start()` is called, so a pending start blocks nothing |
  | Link (§3 step 3) | Yes, one step | Enqueued after `start()` settles |
  | `completeOnce()` (§3 step 4) | Yes, one step | Enqueued when both of its conditions hold |
  | `stopSet()` | **No** | Calls `recorder.stop()` directly |

- **Lock checks happen before enqueueing, and again at the head of the step.** `pause()`, `finish()` and `recordSet()`
  check `recordingSetId` synchronously when called. If the lock is held, they reject at once with
  `WorkoutRuleError('set_recording')` and enqueue nothing. Their queued step checks the lock again before computing
  anything. That second check covers a call made after `recordSet()` but before its lock step ran: call order is kept,
  and the later call is still refused. A pending `start()` therefore never delays a refusal, and a `pause()` already
  on the queue ahead of `recordSet` saves before the lock is taken, so `recordSet` then sees a paused workout and is
  refused by the domain.
- **The in-memory record changes only after a save succeeds.** Each operation:
  1. computes `next = domainFunction(record, …)`;
  2. `await repositories.workouts.save(next)`, which is atomic (#35);
  3. only then sets `record = next`.

  A domain refusal (`WorkoutRuleError`, `WorkoutTransitionError`) or a failed save leaves both the stored and the
  in-memory record unchanged.
- **Repeated actions:**

  | Action | Behaviour |
  |---|---|
  | `recordSet` on the set already recording, or any `recordSet` while the lock is held | `WorkoutRuleError('set_recording')` |
  | `recordSet` on a completed set | The domain's `set_not_planned` |
  | `stopSet` | Calls `recorder.stop()`, which is idempotent. With no attempt, it is a no-op |
  | `pause`, `resume`, `finish` twice | The domain's `WorkoutTransitionError` |
  | `start` twice | The domain's `WorkoutTransitionError` |

  None of these refusals saves anything.
- **Save failures:**
  - *Link save fails* (step 3): the recording keeps running and the set stays `planned`, both stored and in memory.
    When the terminal snapshot arrives, `completeOnce()` applies `beginSetRecording` then `endSetRecording` and saves
    once.
  - *Completion save fails:* `settled` rejects with the error. The attempt keeps its buffered terminal snapshot and
    `completed = false`, and **the lock is kept**, so the workout cannot pause or finish around an unsaved set.
    `retryPendingSave()`, or the next mutating call, re-runs `completeOnce()` first.
  - The lock is released only after a successful completion save.
- **Stale recording events:**
  - Snapshots whose `sessionId` is not the attempt's are ignored. That covers quick sets, earlier attempts, and
    snapshots left after `reset()`.
  - Each attempt has its own subscription, removed when it completes.
  - **`completeOnce()` also waits for `start()` to have settled.** The recording controller can publish a second
    terminal snapshot for the same session: a late start failure replaces `stopped` (`recordStartFailure`). Since
    linking happens only after `start()` resolves or rejects, and the recording controller publishes before it
    rejects, the outcome read in `completeOnce()` is final.
- **Crash recovery:** the open point below.

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

### 4a. Implementation checklist for the four tests

**Prerequisites:**
- PRs #29, #30 and #35 merged.
- The repository API used here is #35's at `26fe72a`. Its code is identical to the `fae478e` head that Codex
  reviewed: the commits since then change docs only.
- The domain functions are `main`'s (`b5a8538`, ADR 0010 Accepted).

**Shared setup:**
- `const db = openNodeSqliteDatabase(); await migrate(db)`, then `repositories = createSqliteRepositories(db)`.
- A recording controller with a step clock and `RotationalRepDetector` (#36's `createController`).
- `WorkoutController({ repositories, recorder, clock, createId, getSessionSensor, getCalibration })`, with
  `getSessionSensor` swapped per test.
- `createExercise('Row', { name: 'Seated row', motion_type: 'rotational' })`, then `create()`,
  `addExercise('row', 'seated-row')`, `addSet(…)` and `setResistance(set, 100, 'lb')`, then `start()`.

**T1 — Normal completion links exactly one session.**
- **Sensor:** `ReplaySensorSource` (id `replay-row`, `simulated`) over the labelled trace, which has 8 full and
  2 partial reps (synthetic).
- **Event order:**
  1. `recordSet(set1)`;
  2. recorder `starting` (session id captured), then `recording`, then `finished`;
  3. the link save;
  4. `completeOnce`;
  5. `settled` resolves;
  6. `finish()`.
- **Persisted state:**
  - `workouts.getById` gives `finished`, with `set1` = `{ status: 'completed', recording_session_id: S,
    resistance: 100 lb entered }`.
  - Exactly one set references S, and `sessions.listRecent` has exactly one session, S.
  - `listSetResults`: 8 full, 2 partial, `simulated`. `getOutcome(S)` is `stream_ended`.
  - `listRecent(1)`: `completed_set_count` 1, with 8 / 2.
  - `listExerciseHistory('row', 1)` gives 100 lb, shown as "100 lb".
  - A second workout's `addSet` for Row prefills 100 lb, and `defaultResistanceUnit()` is `lb`.
  - The controller snapshot has `recordingSetId === null`.

**T2 — A sensor failure completes the set, keeping its saved reps and the error outcome.**
- **Sensor:** `SimulatedSensorSource` over the labelled script, with a `ManualScheduler` and
  `fault: { afterSamples: N, code: 'connection_lost' }`. N is computed in the test: run the detector over the same
  trace, take the sample index of its first rep event, and add 50. At least one rep is then saved.
- **Event order:**
  1. `recordSet(set1)`;
  2. `starting`, then `recording`;
  3. `scheduler.advance(…)`;
  4. the fault, then the recorder's `error` snapshot ("…The N samples received before the failure were saved.");
  5. `completeOnce`;
  6. `settled` **resolves**, with `error` non-null.
- **Persisted state:**
  - `set1` is `completed` and linked to S. `listSetResults` reps equal `repEvents.listBySession(S).length`, which is
    greater than 0 and less than 10.
  - `getOutcome(S)` is `{ end_reason: 'sensor_error', sensor_error_code: 'connection_lost' }`.
    `rawSamples.listBySession(S)` holds the delivered samples.
  - The workout is still `active`, with no pauses.
  - Then `addSet` + `recordSet` (with a replay sensor) completes `set2`: two completed sets, two sessions.

**T3 — A pause during a recording is refused, and the workout and recording stay consistent.**
- **(a) Before the link,** with a deferred-start sensor (`WorkoutSessionController.outcome.test.ts`'s
  `DeferredStartSensor`):
  1. `recordSet` (start pending; the lock step has run and the queue is free, §3b);
  2. `pause()` and `finish()` reject with `set_recording` while `start()` is still pending. The test awaits these
     rejections before it releases the start, so a queue held by `start()` would hang the test, not pass it;
  3. check stored state: workout `active`, `pauses: []`, `set1` still `planned`;
  4. release the start; the link is saved;
  5. `stopSet()`, then `settled`.
- **(b) While recording,** with `SimulatedSensorSource` and a `ManualScheduler`:
  1. `recordSet`; the link is saved;
  2. `pause()` rejects with `set_recording`;
  3. check stored state: `set1` `recording` and linked, workout `active`, `pauses: []`. The recorder is still
     `recording` and its sample count still rises after `scheduler.advance`, so the refused pause did not stop it;
  4. `stopSet()`, then `settled`: `set1` is `completed`.
- **Then, for both:**
  - `pause()` stores `paused` with one open pause;
  - `resume()` stores `active` with that pause closed;
  - `activeDurationMs` excludes the pause.

**T4 — A recording that finishes before `start()` resolves is finalized after its set is linked.**
- **Sensor:** a test sensor whose `start()` delivers the labelled trace's samples, publishes `stopped`, then awaits a
  gate that the test controls.
- **Event order:**
  1. `recordSet(set1)`;
  2. recorder `starting` (S captured), then `finished`, while `start()` is still pending;
  3. check: the terminal snapshot is buffered; `set1` is still `planned` in storage; no `set_not_recording` error;
  4. release the gate;
  5. `start()` resolves;
  6. the link save;
  7. `completeOnce`;
  8. `settled` resolves.
- **Persisted state:**
  - A spy on `workouts.save` records exactly **one** save with `set1` `completed`, after one save with it
    `recording`.
  - The test checks history only after `settled`: `listSetResults` 8 / 2 `simulated`, and `getOutcome(S)`
    `stream_ended`.
  - The lock is released.

**Also in PR 1, as unit tests on in-memory repositories:**
- a quick set (recording controller only) stays standalone, and `recordSet` refuses while one runs;
- the two start-failure cases of §3 step 6;
- every refusal leaves the stored record unchanged, including each repeated action in §3b's table;
- **queue and lock order** (§3b):
  - while a deferred `start()` is pending, `pause()`, `finish()` and a second `recordSet()` reject at once, and a
    non-recording mutation such as `addSet` or `setResistance` on another set completes;
  - `recordSet()` then `pause()` called without awaiting: `pause()` is refused with `set_recording`;
  - `pause()` then `recordSet()` called without awaiting: the pause is saved, and `recordSet` is refused by the domain;
- **save failures** (a `workouts.save` stub that fails once):
  - a failed link save completes the set with one combined save at the end;
  - a failed completion save rejects `settled` and keeps the lock; `retryPendingSave()` then completes the set exactly
    once and releases the lock;
- **stale events:** a terminal snapshot for another session id is ignored, and a second terminal snapshot for the
  same session (a late start failure) does not complete the set twice.

## 5. Done when

- The `it.todo` entries are implemented and pass. (Done 2026-11-09, on the implementation PR.)
- `npm run verify` and both platforms' `expo export` pass.
- CI is green on Linux and Windows.
- A Codex review of the final head has no unresolved P0–P2 findings (at most two fix rounds).
- The PR is retargeted to `main` after #35 merges, and merged by the owner's standing authorization.
- Quick-set behaviour is unchanged: the existing `liveSessionStore` tests still pass.

## 6. Implementation notes (2026-11-09)

The code follows §1–§3b. Where the implementation had to choose, it chose as follows.

**Interfaces:**
- **`SetRecorder`** is the narrow part of the recording controller that `WorkoutController` uses: `start`, `stop`,
  `isBusy`, `getSnapshot` and `subscribe`. Tests can then script the recording controller's event order (stale
  events).
- **`WorkoutSessionController.isBusy()`** is now public. It was private, with the same body. §3 step 1 needs it to
  refuse a set while a quick set runs.

**Recording a set:**
- **The session id is taken only during this attempt's own `start()` call.** The `starting` snapshot is published
  synchronously inside it. The user may start a quick set while the set's sensor is being prepared. Without this
  window, the quick set's `starting` snapshot could be taken for the set's recording. A unit test covers that race.
- **When `recordSet` resolves:** once the recording has started and the link step has run, with `{ sessionId,
  settled }`.
  - It also resolves when start fails after the recording row was created. The set then completes with
    `start_failed`.
  - It rejects when the set may not be recorded, or when no recording was created. The set then stays planned.
- **`stopSet()` before the recording exists** is remembered and applied as soon as `start()` returns.

**Refusals and errors:**
- **`create()` and `load()` are refused while a set records** (`set_recording`), like `pause` and `finish`.
- **Controller errors** that are not domain rules are `WorkoutControllerError`, with these codes:
  - `no_workout`: nothing created or loaded;
  - `recorder_busy`: "Finish the quick set first.";
  - `unknown_set`: the set was not found after it was saved.

**Stopping only this set's recording** (Codex P1 on PR #45, round 1):
- The recording controller is shared with quick sets, and its `stop()` stops whatever records now.
- `stopSet()` and the stop deferred until `start()` returns therefore call it only while the recording running is
  this attempt's own: same session id, and not yet finished.
- Without that check, a set whose completion save failed could stop a quick set started since.

**Defensive paths for a recorder that misbehaves:**
- If storage cannot say whether a failed start left a recording row, none is assumed: the set stays planned and the
  lock is released.
- A failed start with no terminal snapshot seen uses the failure itself as the outcome.
- A domain refusal during completion is handled like a failed save: the lock is kept and the error is shown.

**Crash recovery** (the §3b open point) is implemented minimally in `load()`:
- a set left `recording` is completed and keeps what its recording saved;
- the snapshot says "interrupted" when that recording has no end time;
- the recording row itself is not changed.

The owner may still prefer a different rule.

**Tests:**
- **SQLite integration:** T1, T2, T3 (a) and (b), and T4. `WorkoutController.sqlite.test.ts` has 5 tests.
- **Unit tests** on in-memory repositories (`WorkoutController.test.ts`, 17 tests). They cover every item in the
  §4a list, plus:
  - the quick-set race;
  - the next change saving a pending set;
  - load-time recovery.
- **Mutation checks**, run by hand. Each of six defects fails at least one test:
  - `start()` holding the queue;
  - no buffering of the terminal snapshot;
  - taking any `starting` snapshot;
  - changing memory before the save;
  - releasing the lock after a failed completion save;
  - not filtering stale snapshots.
