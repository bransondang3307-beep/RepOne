// RO-014 PR 1: integration tests for the WorkoutController through the real SQLite repositories, defined ahead of
// the implementation. Each test's setup, event order and expected persisted state is in
// docs/plans/RO-014-pr1-workout-controller.md §4a (T1–T4). Implemented on this branch once PRs #29, #30 and #35
// merge. The harness will be the one in WorkoutSessionController.sqlite.test.ts (PR #36): node:sqlite + migrate +
// createSqliteRepositories, a recording controller with a step clock, the labelled synthetic trace.
// Post-recording assertions wait for the WORKOUT-level `settled` promise that recordSet returns (plan §3a), never for
// the recording controller's own finished/error snapshot, which comes before the set is saved and the lock released.
// Every recording here is SYNTHETIC (simulated or replayed): nothing measures real reps.

describe('WorkoutController × SQLite (integration, RO-014 PR 1)', () => {
  it.todo('T1 normal completion: links exactly one session, completes the set, and history shows 8 full / 2 partial, stream_ended, 100 lb');

  it.todo('T2 sensor failure: the set completes with sensor_error / connection_lost and the reps saved before the failure; the workout stays active');

  it.todo('T3 pause during a recording is refused (before and after the link) and leaves the workout and recording consistent');

  it.todo('T4 a recording that finishes before start() resolves is finalized once, after its set is linked; history is read after settled');
});
