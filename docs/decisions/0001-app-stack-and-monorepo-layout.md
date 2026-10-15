# ADR 0001 — App stack and monorepo layout

- **Date:** 2026-10-15
- **Status:** Accepted (owner approved layout option "apps/mobile + packages/core" on 2026-10-15)
- **Resolves:** Source of truth §12 open decision 4 ("Initial app stack/platform and repo status")

## Context

The repository did not exist before Sprint 1 — nothing to migrate. The owner specified
React Native + Expo + TypeScript, SQLite (offline-first), Zustand, Expo Router / React
Navigation, and Jest. The source of truth (§6) *suggests* a `software/{capture,processing,app}`
layout; the Sprint 1 brief requested `apps/mobile/`. Business logic must be testable without
React Native (principle 7) and replaceable (principle 8).

## Decision

npm-workspaces monorepo:

```
RepOne/
  apps/mobile/        Expo SDK 57 app (Expo Router, expo-sqlite, Zustand). UI + composition root only.
    app/              Routes (screens) — Expo Router file-based routing
    src/di/           Composition root: picks concrete implementations
    src/persistence/  expo-sqlite adapter for the core SqlDatabase port
    src/state/        Zustand store mirroring core controller snapshots
    src/ui/           Presentational components + theme tokens
  packages/core/      @repone/core — pure TypeScript, no React / React Native imports
    src/sensors/      SensorSource interface + Simulated / Replay implementations
    src/simulation/   Seeded synthetic motion + labelled traces
    src/processing/   Calibration, MotionDetector interface, rotational rep FSM
    src/evaluation/   Precision / recall / failure-case evaluation vs labels
    src/persistence/  Repository interfaces, in-memory + SQLite (driver-agnostic) implementations
    src/session/      WorkoutSessionController (sensor → store → detector → events)
  docs/decisions/     ADRs
```

Dependency direction is one-way: `apps/mobile` → `@repone/core` public API (`src/index.ts`) only.
Core never imports a concrete SQLite driver, timer or UI; those are injected (`SqlDatabase`,
`Scheduler`, `Clock`, `IdGenerator`, `DetectorFactory`).

Mapping to source-of-truth §6: `packages/core/src/sensors` ≈ `software/capture`,
`packages/core/src/{processing,evaluation}` ≈ `software/processing`, `apps/mobile` ≈ `software/app`.
`firmware/`, `data/`, `docs/{experiments,hardware,product}` remain as suggested and will be added
when there is content.

## Consequences

- Core logic is tested under plain Node/Jest (ts-jest); SQLite repositories are tested against
  Node's built-in `node:sqlite` through the same port the app uses with expo-sqlite.
- Metro consumes `@repone/core` as TypeScript source via workspaces (no build step).
- A future Python analysis toolchain (§4 H0) can live alongside without affecting the app.
- **Source of truth §6 has not been edited**; update it if the owner wants this layout recorded there.
