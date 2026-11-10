# ADR 0010 — Workout domain model and lifecycle (Milestone 3)

- **Date:** 2026-11-06
- **Status:** **Accepted (2026-11-08).** The owner confirmed every §5 decision. Decisions 1–4 follow the owner's
  direction of 2026-11-06. Decisions 5 and 6 were confirmed on 2026-11-08: "I approve all six defaults. … Milestone 3: Workouts pause only between sets. SQLite stores why each recording ended and the source ID for each rep."
  Part 1 (pure domain) is [PR #33](https://github.com/bransondang3307-beep/RepOne/pull/33), merged 2026-11-08 (`b5a8538`); part 2 (persistence) is
  [PR #35](https://github.com/bransondang3307-beep/RepOne/pull/35) (`claude/RO-013-sqlite-persistence`).
- **Task:** RO-013, following [the Milestone 3 plan](../plans/RO-013-milestone-3-plan.md). The owner's go-ahead
  came on 2026-11-06 ("If Milestone 3 can proceed independently of open PRs, begin implementation").
- **Builds on:**
  - [ADR 0003](0003-full-spec-module-layout.md) §6: full reps count toward a set, partial reps are logged;
  - [ADR 0006](0006-rebrandable-product-identity.md): brand-free identifiers;
  - [ADR 0007](0007-sensor-errors-channels-device-connections.md): deferred end reason and rep-event `source_id`.
- **Unchanged:** sensor units, `RawSensorSample`, `RepEvent`, `RepCalibration`, the rep detector, and existing
  repository ports and tables.

## 1. Context

Today the app stores one thing: a sensor **recording** (`workout_sessions`), with its raw samples and rep events.
Milestone 3 adds the workout structure around recordings:
- exercises and machines;
- user-entered resistance;
- a workout with a lifecycle;
- sets whose reps are the recording's rep events.

It does this without touching existing data or the sensor contracts.

## 2. Decision — model (`packages/workout-domain/src/model.ts`)

| Type | Fields (units in names) | Notes |
|---|---|---|
| `Machine` | `id`, `name`, `motion_type: 'rotational' \| 'linear' \| 'unknown'`, `notes`, `created_at_epoch_ms` | The detector supports `rotational` only; `linear` lets the app warn |
| `Exercise` | `id`, `name`, `created_at_epoch_ms` | |
| `ExerciseMachineLink` | `exercise_id`, `machine_id` | Many-to-many |
| `Workout` | `id`, `status`, `created_at_epoch_ms`, `started_at_epoch_ms`, `ended_at_epoch_ms`, `pauses[]` | `status`: `planned` · `active` · `paused` · `finished` |
| `WorkoutPause` | `start_epoch_ms`, `end_epoch_ms \| null` | Ordered, non-overlapping, inside the workout |
| `WorkoutExercise` | `id`, `workout_id`, `exercise_id`, `machine_id \| null`, `position` | Order within the workout |
| `WorkoutSet` | `id`, `workout_exercise_id`, `position`, `status`, `recording_session_id \| null`, `resistance \| null` | `status`: `planned` · `recording` · `completed` |
| `Resistance` | `kg`, `entered_unit: 'kg' \| 'lb'`, `source: 'user_entered'` | No other source exists in the type |
| `WorkoutRecord` | `workout`, `exercises`, `sets` | The aggregate the lifecycle operates on |

**Additions to the plan.**
- `WorkoutSet.status` makes "a set is recording" explicit. The pause rule depends on it, and deriving it from the
  recording's end time would tie the domain to persistence.
- `Workout.created_at_epoch_ms` lets a planned workout be ordered and bounds its start time.

## 3. Decision — rules (`workoutLifecycle.ts`, `resistance.ts`)

- **Transitions.**
  - `start` moves planned → active;
  - `pause` moves active → paused;
  - `resume` moves paused → active;
  - `finish` moves active or paused → finished. A finish while paused closes the open pause at the finish time.
  - Anything else throws `WorkoutTransitionError { from, action }`.
- **Other rules** throw `WorkoutRuleError` with a stable `code`:
  - a finished workout is read-only;
  - a set records only while the workout is active, and only one set at a time;
  - pausing or finishing is refused while a set is recording;
  - ids are unique within a workout;
  - a set must belong to one of the workout's exercises;
  - time never goes backwards;
  - names are 1–80 characters after trimming.
- **Positions** are appended (next free index), so they are unique per workout and per exercise.
- **Resistance.**
  - Entered in kg or lb; it must be > 0 and ≤ 1000 in the entered unit, which catches typos.
  - Stored as kg using 1 lb = 0.45359237 kg exactly, and shown back in the entered unit rounded to 0.01.
  - "Not entered" is `null`, never 0.
  - It can be corrected after a set is recorded, until the workout is finished.
- **Reps per set.** `summarizeSetReps(rep_events)` counts `full` reps toward the set and logs `partial` reps
  separately. Counts are computed on read and never stored twice.
- **`validateWorkoutRecord`** lists every invariant violation. Persistence (part 2) runs it before saving, so a
  record built outside the lifecycle functions cannot be stored inconsistent.
- **Active duration** = end (or now) − start − pauses.

## 4. Persistence (part 2, `claude/RO-013-sqlite-persistence`)

**Implemented as planned:**
- Recordings stay as they are; a set links to one through `recording_session_id` (`ON DELETE SET NULL`).
- Migration v2 is append-only and additive:
  - tables `machines`, `exercises`, `exercise_machines`, `workouts`, `workout_pauses`, `workout_exercises` and
    `workout_sets`;
  - nullable `end_reason` and `sensor_error_code` on `workout_sessions`, and nullable `source_id` on `rep_events`.
- CHECK constraints enforce `resistance_source = 'user_entered'`, a positive `resistance_kg`, a known unit, a fully
  filled or fully empty resistance, the status values and the end-reason values.
- Foreign keys reject sets of missing workout exercises.
- Deleting a workout never deletes a recording, its samples or its rep events.
- The plan's §5 migration criteria are each covered by a test (`migrations.test.ts`).

**Deviations from the plan, all for compatibility with open PRs:**
- **`WorkoutSession` and `WorkoutSessionSummary` are unchanged.** PR #30 builds these objects in its tests, so new
  required fields would break it after merge. Instead:
  - `markEnded` takes an **optional** `outcome`;
  - `getOutcome(sessionId)` reads it back;
  - `repEvents.append` takes an **optional** `sourceId`, and `listSourceIdsBySession` reads it.
  - Callers that omit them keep working; the value is then stored as unknown (null).
- **Sets are saved with their workout.** The planned `WorkoutSetRepository` is folded into
  `WorkoutRepository.save(record)`, which stores the whole aggregate atomically after `validateWorkoutRecord`. That
  keeps the invariants in one place.
- **Every SQLite repository operation, reads included, runs on one queue.** expo-sqlite transactions are not
  exclusive and the connection is shared. Without the queue, a workout save could interleave with sample writes, and
  a read could see a save half done (Codex P1 on PR #35).

**History queries:**
- `workouts.listRecent`: summaries with rep totals from the sets' recordings;
- `workouts.listSetResults`: each set with its rep counts and its recording's provenance;
- `workouts.listExerciseHistory`: an exercise's recorded sets, newest first, with the resistance entered, for "last
  time".

**Recording outcome.** The controller stores `stopped`, `stream_ended`, `sensor_error`, `start_failed` or
`write_failed`, with the sensor's error code. A failed write outranks the sensor. A sensor failure before `start()`
resolves is `start_failed`. A late start failure after a stop replaces the stored `stopped` and keeps the end time.
Rep events are stored with the sensor's `source_id`.

**Known edge.** If a recording is ever deleted, its sets keep `status = 'completed'` with no recording. Re-saving
that workout would then fail `validateWorkoutRecord`. The app has no way to delete a recording today.

## 5. Decisions for the owner (the plan's §4)

| # | Question | Taken here | Basis |
|---|---|---|---|
| 1 | Sets vs existing recordings | **(a)** keep `workout_sessions` as recordings; sets link to them | Owner direction 2026-11-06: "preserve existing saved workout data" |
| 2 | Existing History rows (all simulated) | **(a)** leave them as standalone recordings, outside any workout | Same; no invented structure |
| 3 | Machine–exercise link | **(a)** many-to-many | Owner direction: "machine/exercise associations" |
| 4 | Resistance storage | **(a)** canonical kg + entered unit, source `user_entered` only | Owner direction: "user-entered resistance and measurement units" |
| 5 | When can a workout pause? | **(a)** only between sets | Plan recommendation; **confirmed by the owner, 2026-11-08** |
| 6 | Include the ADR 0007 deferrals (end reason, rep-event `source_id`)? | **(a)** yes, in part 2 | Plan recommendation; **confirmed by the owner, 2026-11-08** |

## 6. Consequences

- Part 1 adds types and pure functions only.
- Part 2 adds a migration, ports and an adapter. Existing rows, columns and port signatures stay compatible: the new
  parameters are optional.
- There is no UI until Milestone 4 (RO-014); the rules are verified by unit tests.
- Brand-free names throughout (ADR 0006).
