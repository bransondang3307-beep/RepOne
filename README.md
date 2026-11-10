# RepOne

Portable gym-machine rep-tracking device + companion mobile app. Read
[`REPONE_SOURCE_OF_TRUTH.md`](./REPONE_SOURCE_OF_TRUTH.md) and [`AGENTS.md`](./AGENTS.md) first.

## Actual state (end of Sprint 1, alignment Milestones 1–5)

> Until PRs #29, #30, #35, #37 and #45–#47 merge, this section describes that Milestone 4 stack candidate, not `main`.
> RO-015 PR 5.1 is refreshed when they merge.

The device checks the owner ran on an iPhone, and their dates, are recorded in
[`PROJECT_STATUS.md`](PROJECT_STATUS.md). The Sprint 1 summary is in
[`docs/sprint-1-summary.md`](docs/sprint-1-summary.md).

| Area | State |
|---|---|
| Hardware / real IMU data | **Not connected.** No real sensor has fed this software. The GY-521 / MPU-6050 is not physically verified (RO-018) |
| Firmware (Uno R3, USB serial) | Compiled and host-tested against the shared golden packets and the app's decoder; **never flashed** |
| IMU stream wire protocol + codec | Implemented (`@repone/sensor-protocol`); [ADR 0008](docs/decisions/0008-imu-stream-wire-protocol.md) stays **Proposed** until hardware evidence |
| BLE | The iPhone adapter (PR #28) is parked; carried to Sprint 2 |
| Sensor abstraction | `SensorSource` and `DeviceConnection` contracts, simulated and replay sources, a multi-channel `SimulatedDevice`, shared contract tests |
| Rep detector (rotational FSM, full / partial) | Implemented; verified **only on synthetic data** |
| Workouts | Workout → exercise → set → reps, machines with motion type, start / pause between sets / resume / finish ([ADR 0010](docs/decisions/0010-workout-domain-model.md)) |
| Resistance | **Entered by the user** (kg or lb) and labelled "entered"; the sensor never measures it |
| SQLite persistence | Migration v2 with workouts, recording outcomes and per-rep `source_id`; tested with `node:sqlite`, including a file-backed v1 → v2 upgrade |
| Mobile app (Expo SDK 58, Expo Router, Zustand) | Today, Record and History tabs, and the workout flow; runs in Expo Go |
| Routines, AI features, weight measurement, cloud | Not started (out of Sprint 1 scope) |

Every rep count in the app comes from **simulated data** (or a replay of it) and is labelled as such.

## Layout

See [`docs/architecture.md`](docs/architecture.md) and [ADR 0003](docs/decisions/0003-full-spec-module-layout.md).

```
apps/mobile/
  app/                  Routes (Expo Router)
  src/application/      Composition root + application services (WorkoutSessionController, WorkoutController)
  src/features/         rep-tracking, workouts, device-connection
  src/shared/           Feature-agnostic components + theme
  src/infrastructure/   database (expo-sqlite adapter, migrations)
packages/
  sensor-contracts/     Sensor + derived-event contracts, deterministic simulation
  rep-engine/           Pure TS rep detection, calibration, evaluation
  workout-domain/       Workout models + repository interfaces
  sensor-protocol/      IMU stream wire protocol codec (ADR 0008, proposed)
firmware/               Uno R3 USB bring-up + portable protocol layer (compiled and host-tested, never flashed); BLE backend pending
docs/                   architecture.md, hardware-protocol.md, protocols/, decisions/, plans/, acceptance/
scripts/                check-boundaries.mjs, check-workflow-policy.mjs, dev-host/
```

## Getting started

Requires Node 22+ (SQLite tests use the built-in `node:sqlite`).

```bash
npm install
npm run verify       # module boundaries + workflow policy (no AI APIs) + typecheck + all tests
cd apps/mobile && npx expo start   # run in Expo Go / simulator
```

## Architecture rules

- Dependency direction: UI → application services → domain + rep engine → contracts;
  infrastructure implements contracts. Enforced by `npm run check:boundaries`.
- Packages are imported only through their public entry (`@repone/<name>`); test utilities via
  `@repone/<name>/testing` in tests only.
- Any new sensor (USB serial, BLE) must pass `describeSensorSourceContract`; any new store must
  pass `describeRepositoriesContract`.
- Units live in field/column names (`_m_s2`, `_rad_s`, `_rad`, `_ms`, `_epoch_ms`).
