# Handoff — RO-012 part 1: sensor error states and failure handling

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-23 |
| **Task** | RO-012 (`TASKS.md`), Milestone 2, resumed by the owner on 2026-10-23. Part 1 of 4 |
| **Branch** | `claude/RO-012-sensor-error-states` (base: `main` @ `9b8b81a`) |
| **Commits** | see the PR's commit list |
| **Pull request** | opened from this branch (link recorded in a follow-up commit) |
| **Status** | implemented; verified locally (tests, typecheck, Expo exports); awaiting Codex review, owner merge |

## Objective
Start Milestone 2 with the increment every later part depends on: sensors can fail with a reason, the shared contract
suite tests that, and a recording ends honestly when the sensor, its start or a write fails. The design for the whole
milestone is ADR 0007 (Proposed).

## Prerequisites checked
**Blocking:** none. RO-003 is merged, and the owner gave the go-ahead on 2026-10-23.

**Not blocking:**
- **Documentation PRs (#2, #6, #7, #8, #9, #13).** None changes code this work touches. This branch edits only the
  RO-012 row and section of `TASKS.md`. Its trial merge with PR #13's branch is clean (see below).
- **RO-016 (H0 sample rate and packet schema).** It blocks a real USB-serial adapter, which is outside Milestone 2.
- **PR #8's checker hardening (finding 2).** Isolating `infrastructure/<adapter>` folders from each other matters only
  when a second infrastructure adapter exists. Milestone 2 adds none: the simulated device lives in
  `@repone/sensor-contracts`.
- **PR #6's naming rule.** I followed it: all new identifiers and messages are brand-free.

## What changed
- **`@repone/sensor-contracts`** (contract change, ADR 0007 §1):
  - `SensorError { code, message }` and `SensorErrorCode`: `start_failed`, `connection_lost`, `stream_timeout`,
    `invalid_data`, `unknown`.
  - `SensorStartError`, and `SensorSource.getLastError()`. The lifecycle is documented on `SensorStatus`.
  - `BaseSensorSource.fail()` records the reason **before** publishing `error`. The first failure wins, and a later
    start clears it.
  - `SimulatedSensorSource` takes an optional deterministic `fault` (`afterSamples`, `code`, `message`). With no fault
    the stream is byte-for-byte unchanged; a test compares it with `generateTrace`.
  - `describeSensorSourceContract(name, harness, options)` adds:
    - status-listener unsubscription;
    - `start()` twice (no duplicate stream);
    - `stop()` as a no-op unless streaming;
    - `finite: false` for continuous sources, and `minSampleRateHz`;
    - opt-in mid-stream and start-failure tests.

    The simulated source runs it three ways (finite, looping live, failing); the replay source runs the lifecycle tests.
- **`WorkoutSessionController`** (application service):
  - Every ending goes through `finalize`: it releases the sensor, flushes samples and marks the session ended.
  - A sensor failure now ends in `error`, not `finished`, with `snapshot.sensorError` and a message that says how many
    samples were saved.
  - A failed `start()` no longer leaves the controller stuck as "already in progress".
  - A failed write stops the recording, and `error` is no longer overwritten by `finished` on stop.
  - **No UI change:** the screen already shows `error` and `session.error`.
- **Docs:**
  - ADR 0007 (new, Proposed): the decision implemented here, plus the plan for parts 2–4.
  - `docs/architecture.md`: module status, the data-flow failure path, the contract-suite options.
  - `docs/hardware-protocol.md`: the failure-reporting table for adapters.
  - `TASKS.md`: the RO-012 row → `in-progress`, and the four-part plan.
- **Unchanged:** the rep-engine package, units, the database schema, the UI and the composition root.

## Files changed
- `packages/sensor-contracts/src/sensor.ts`, `BaseSensorSource.ts`, `index.ts`, `simulation/SimulatedSensorSource.ts`,
  `testing/sensorSourceContract.ts`, `testing/index.ts` — modified
- `packages/sensor-contracts/test/sensorSources.test.ts` — modified
- `apps/mobile/src/application/services/WorkoutSessionController.ts` and its `__tests__/…test.ts` — modified
- `docs/decisions/0007-sensor-errors-channels-device-connections.md` — added
- `docs/architecture.md`, `docs/hardware-protocol.md`, `TASKS.md` — modified
- `docs/handoffs/2026-10-23-claude-RO-012-sensor-error-states.md` — added. It is not yet in `docs/handoffs/README.md`'s
  index, because PR #13 edits the same table; the entry follows in a later RO-012 part, so the two PRs merge in either
  order.

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm ci` (Linux, Node 22.22.0) | exit 0 |
| `npm run verify` | exit 0. Boundaries OK (58 files, no circular imports); workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files); typecheck OK; Jest **70/70**: mobile 19 (was 15), rep-engine 16 (unchanged), sensor-contracts 31 (was 13), workout-domain 4 |
| `npm run test:scripts` (inside `npm test`) | tests 62, pass 62, fail 0 |
| `npx expo export --platform android` (Expo CLI 57.0.31) | exit 0. Hermes bundle 2.7 MB |
| `npx expo export --platform ios` | exit 0. Hermes bundle 2.4 MB |

Negative controls (run, then reverted):
- **Breaking the contract.** I made each of three changes in turn:
  - publish `error` before recording the reason;
  - let a second `start()` launch a second stream;
  - let `stop()` publish `stopped` when idle.

  Each one fails its intended contract test (1, 2 and 2 failures).
- **Old controller, new tests.** The new controller tests run against `main`'s controller give **4 failed / 5 passed**.
  Exactly the four new failure-handling tests fail.

Environment notes:
- No device run is possible in this container.
- Rep counting is unchanged: there are no rep-engine edits, and its 16 tests are unchanged and passing.
- The simulated fault is only exercised in tests. The app's demo sensor has no fault configured.

## Decisions / ADRs
- [ADR 0007](../decisions/0007-sensor-errors-channels-device-connections.md) (Proposed). Decision 1 is implemented
  here; decisions 2–4 plan parts 2–4. Contract changes need Codex review (`docs/architecture.md` §6).

## Known limitations / risks
- **`SensorSource` gained a method.** Any implementation outside `BaseSensorSource` must add `getLastError()`; none
  exists.
- **No end reason in the database.** Stored sessions don't record why they ended; that's Milestone 3 schema work.
- **Message text.** The error text is English and built in the application service. The structured `sensorError` lets
  the UI own the wording later.
- **Untested on hardware.** No real transport exists, so the error codes have only been exercised against the
  simulator.

## Next steps
1. **Codex:** review this PR, especially the contract change and the controller's finalisation paths.
2. **Owner:** merge decision; confirm or adjust ADR 0007 decision 2 (channel = `source_id`) before part 2 is reviewed.
3. **Claude Code:** RO-012 part 2 (channels and per-channel wrapper), on a branch from `main`, or stacked on this one
   if it isn't merged yet.

## Questions for the owner
- ADR 0007 decision 2: identify a channel by the existing `source_id` (one physical IMU per channel; no new field). Do
  you agree, or do you want an explicit channel index?
