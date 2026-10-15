# ADR 0003 — Align with the full Sprint 1 spec: module layout, sample contract, partial reps

- **Date:** 2026-10-15
- **Status:** Accepted (owner approved plan, raw-IMU contract and partial-rep policy on 2026-10-15)
- **Supersedes:** the layout section of ADR 0001

## Context

The original Sprint 1 brief reached Claude Code truncated at §3, so the first implementation
used a single `packages/core`. The owner then supplied the full brief, which requires three
packages (`rep-engine`, `sensor-contracts`, `workout-domain`), an app organised as
`features/ shared/ infrastructure/`, `docs/architecture.md` and `docs/hardware-protocol.md`,
and the dependency direction UI → Application Services → Domain + Rep Engine → Contracts.

## Decisions

1. **Split `packages/core`** (moved with `git mv`, not rewritten):
   - `@repone/sensor-contracts` — common types, `RawSensorSample`, `SensorSource`, plus the
     **derived contracts** `RepEvent`, `MotionDetector`, `RepCalibration`. These live here (not in
     rep-engine) so `workout-domain` can store events and calibrations without depending on the
     engine — the spec places Domain and Rep Engine side by side.
     It also hosts **Module B (sensor simulation)**: the spec defines no package for it, the mock
     must implement the contract, and both rep-engine tests and the app need it. Kept in
     `src/simulation/`, exported separately; may become its own package if it grows.
   - `@repone/rep-engine` — calibration functions, `RotationalRepDetector`, `evaluateReps`.
   - `@repone/workout-domain` — workout models + repository interfaces + in-memory store.
2. **App layers.** `src/application/` holds the composition root and **application services**
   (the spec's diagram has this layer; its folder tree does not). `WorkoutSessionController`
   moved there because it coordinates sensor + engine + repositories. SQLite repositories and
   migrations moved to `src/infrastructure/database/` (spec Module E: adapter in infrastructure).
3. **Reusable contract suites** exported from `@repone/sensor-contracts/testing` and
   `@repone/workout-domain/testing` (package `exports` subpath), so infrastructure adapters run
   exactly the same tests as the reference implementations.
4. **Boundaries are enforced** by `scripts/check-boundaries.mjs` (`npm run check:boundaries`),
   zero dependencies, including circular-import detection.
5. **Sensor sample contract stays raw IMU** (`accel_m_s2`, `gyro_rad_s`), not "position
   samples". Position/angle is derived by the engine. Rationale: matches the source of truth and
   the MPU-6050; double-integrating acceleration to position drifts.
6. **Partial reps:** only `full` reps count toward a set; `partial` reps are recorded with their
   label for history/analysis (satisfies both "reject incomplete movements" and the source of
   truth's full-vs-partial requirement). Applied to the set model in Milestone 3.
7. **Workspace tooling:** plain npm workspaces, no monorepo tool (spec §3).

## Consequences

- No behaviour change in Milestone 1: same 46 tests, redistributed across workspaces.
- Ownership can be split per package (see `docs/architecture.md` §6).
- Module G (device connectivity) and multi-channel contracts are added in Milestone 2.
- `REPONE_SOURCE_OF_TRUTH.md` §6 still shows its own suggested layout; updating it needs owner approval.
