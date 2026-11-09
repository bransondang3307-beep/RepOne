# RepOne

Portable gym-machine rep-tracking device + companion mobile app. Read
[`REPONE_SOURCE_OF_TRUTH.md`](./REPONE_SOURCE_OF_TRUTH.md) and [`AGENTS.md`](./AGENTS.md) first.

## Actual state (Sprint 1, Milestone 1 of the alignment plan — 2026-10-15)

| Area | State |
|---|---|
| Hardware / real IMU data | **Not implemented.** No real sensor has been connected to this software. |
| Sensor abstraction (`SensorSource`) | Implemented: simulated + replay sources, shared contract tests |
| Synthetic labelled traces | Implemented, seeded and reproducible |
| Rotational rep detector (FSM) + full/partial | Implemented; verified **only on synthetic data** |
| Evaluation (precision / recall / failure cases) | Implemented |
| SQLite persistence + migrations | Implemented; tested via `node:sqlite`; expo-sqlite adapter type-checked, not run on device |
| Mobile app (Expo Router + Zustand) | Workout + history screens; JS bundle builds; **not yet run on a device/simulator** |
| BLE, USB serial, machine profiles, routines, AI, weight | Not started (out of Sprint 1 scope) |

All rep counts currently shown in the app come from **simulated data** and are labelled as such.

## Layout

See [`docs/architecture.md`](docs/architecture.md) and [ADR 0003](docs/decisions/0003-full-spec-module-layout.md).

```
apps/mobile/
  app/                  Routes (Expo Router)
  src/application/      Composition root + application services (WorkoutSessionController)
  src/features/         rep-tracking, workouts (exercises, machines, device-connection: planned)
  src/shared/           Feature-agnostic components + theme
  src/infrastructure/   database (expo-sqlite adapter, migrations)
packages/
  sensor-contracts/     Sensor + derived-event contracts, deterministic simulation
  rep-engine/           Pure TS rep detection, calibration, evaluation
  workout-domain/       Workout models + repository interfaces
  sensor-protocol/      IMU stream wire protocol codec (ADR 0008, proposed)
firmware/               Uno R3 USB bring-up + portable protocol layer (compiled, not hardware-verified); BLE backend pending
docs/                   architecture.md, hardware-protocol.md, protocols/, decisions/
scripts/                check-boundaries.mjs
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
