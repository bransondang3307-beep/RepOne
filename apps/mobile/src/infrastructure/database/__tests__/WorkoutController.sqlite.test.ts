// RO-014 PR 1: integration tests for the WorkoutController through the real SQLite repositories, defined ahead of
// the implementation (docs/plans/RO-014-pr1-workout-controller.md §4). Implemented on this branch once PR #35, #29
// and #30 merge. The harness will be the one in WorkoutSessionController.sqlite.test.ts (PR #36): node:sqlite +
// migrate + createSqliteRepositories, a recording controller with a step clock, the labelled synthetic trace.
// Post-recording assertions wait for the WORKOUT-level `settled` promise that recordSet returns (plan §3a), never for
// the recording controller's own finished/error snapshot, which comes before the set is saved and the lock released.
// Every recording here is SYNTHETIC (simulated or replayed): nothing measures real reps.

describe('WorkoutController × SQLite (integration, RO-014 PR 1)', () => {
  it.todo(
    'normal completion: a recorded set completes, links to its recording and reads back through history (8 full, 2 partial, stream_ended, 100 lb, prefill and unit remembered)',
  );

  it.todo(
    'sensor failure: the set completes with the reason (sensor_error / connection_lost) and the reps saved before the failure; the workout stays active and a new set can be recorded',
  );

  it.todo(
    'pause and finish are refused with set_recording while a set is starting or recording, and work once the set has settled',
  );

  it.todo(
    'a recording that settles before start() resolves is buffered and completes the set exactly once, after its link is saved',
  );
});
