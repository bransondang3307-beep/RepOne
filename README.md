# RepOne

Portable gym-machine rep-tracking device + companion mobile app. Read
[`REPONE_SOURCE_OF_TRUTH.md`](./REPONE_SOURCE_OF_TRUTH.md) and [`AGENTS.md`](./AGENTS.md) first.

## Actual state (Sprint 1 — 2026-10-15)

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

See [ADR 0001](docs/decisions/0001-app-stack-and-monorepo-layout.md).

```
apps/mobile/     Expo app — UI, Zustand store, composition root, expo-sqlite adapter
packages/core/   Pure TypeScript domain logic (no React Native) — sensors, simulation,
                 detection, evaluation, persistence, session orchestration
docs/decisions/  Architecture decision records
```

## Getting started

Requires Node 22+ (core tests use the built-in `node:sqlite`).

```bash
npm install
npm test             # core + mobile Jest suites
npm run typecheck    # tsc --noEmit in every workspace
cd apps/mobile && npx expo start   # run in Expo Go / simulator
```

## Architecture rules

- `apps/mobile` imports `@repone/core` only through its public `src/index.ts`.
- Core receives its dependencies (SQL driver, clock, scheduler, ID generator, detector factory).
- Any new sensor (USB serial, BLE) implements `SensorSource` and must pass
  `packages/core/test/sensorSources.test.ts`; any new store must pass `repositories.test.ts`.
- Units live in field/column names (`_m_s2`, `_rad_s`, `_rad`, `_ms`, `_epoch_ms`).
