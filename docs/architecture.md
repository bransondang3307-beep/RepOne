# RepOne architecture

> Status: describes what is **implemented** on branch `sprint-1-alignment` (Milestone 1).
> Items marked *planned* do not exist yet. Decisions: [`docs/decisions/`](decisions/).

## 1. Layers and dependency direction

```
 Mobile UI  (apps/mobile/app routes, src/features/*, src/shared)
     ↓  feature hooks only
 Application services  (apps/mobile/src/application)
     ↓  dependency injection
 Domain + Rep engine  (@repone/workout-domain, @repone/rep-engine)
     ↓
 Interfaces / contracts  (@repone/sensor-contracts)
     ↑
 Infrastructure adapters  (apps/mobile/src/infrastructure/*)
```

Infrastructure implements contract/domain interfaces; only the composition root
(`src/application/createAppContainer.ts`) chooses concrete implementations.

## 2. Modules

| Module (spec) | Location | Public API | Status |
|---|---|---|---|
| A — Sensor contracts | `packages/sensor-contracts/src/{common,sensor,derived}.ts` | `@repone/sensor-contracts` | Implemented; multi-channel + richer error states *planned (M2)* |
| B — Sensor simulation | `packages/sensor-contracts/src/simulation/` | same package | Implemented |
| C — Rep engine | `packages/rep-engine/src/` | `@repone/rep-engine` | Implemented (single channel); per-channel state *planned (M2)* |
| D — Workout domain | `packages/workout-domain/src/` | `@repone/workout-domain` | Session + repository ports only; exercises/sets/resistance/lifecycle *planned (M3)* |
| E — Persistence | `apps/mobile/src/infrastructure/database/` | `infrastructure/database/index.ts` | SQLite adapter + migrations implemented; new tables *planned (M3)* |
| F — Mobile UI | `apps/mobile/app/`, `src/features/`, `src/shared/` | feature `index.ts` files | Active set + history; dashboard, exercise selection, pause *planned (M4)* |
| G — Device connectivity | `src/features/device-connection/`, `src/infrastructure/bluetooth/` | — | *Planned (M2)*; no native BLE deps in Sprint 1 |
| Application services | `apps/mobile/src/application/` | `application/index.ts` | `WorkoutSessionController`, composition root |

Folders from the spec tree that have no code yet (`features/exercises`, `features/machines`,
`features/device-connection`, `shared/hooks`, `shared/utils`, `infrastructure/sensors`,
`infrastructure/bluetooth`) are created when their milestone adds content — git does not
track empty folders.

## 3. Boundary rules (enforced by `npm run check:boundaries`)

| From | May import | Must not import |
|---|---|---|
| `@repone/sensor-contracts` | nothing internal | any `@repone/*`; React, RN, Expo, Zustand, SQLite, BLE |
| `@repone/rep-engine`, `@repone/workout-domain` | `@repone/sensor-contracts` | each other; platform libraries |
| `application/services` | `@repone/*` packages | React/RN/Expo/Zustand, features, shared, infrastructure |
| `application` (composition root, providers) | packages, services, infrastructure | features, shared, routes |
| `features/<x>` | packages, `application` (index), `shared` (index), own files | other features, infrastructure |
| `shared` | packages, React/RN, own files | features, application, infrastructure |
| `infrastructure/<x>` | packages, driver libraries, own files | application, features, shared |
| routes (`app/`) | features, shared, application — via their `index.ts` | infrastructure |

Additional rules: no deep imports into packages (`@repone/x/src/...`); `@repone/x/testing` only
from tests; no relative imports across packages; **no circular imports**. Tests may import the
internals of the unit they exercise. No global event bus or module-level singletons — the
container is created once at boot and passed through React context.

## 4. Data flow — recording a set

1. Route calls `useLiveSession().startSimulatedSet()` (feature hook → Zustand store).
2. Store calls `WorkoutSessionController.start({ sensor, calibration })` (application service).
3. Controller subscribes to the `SensorSource`; each `RawSensorSample` is batched to
   `RawSampleRepository` and pushed to the `MotionDetector` (`RotationalRepDetector`).
4. Emitted `RepEvent`s are appended to `RepEventRepository`; the controller publishes a
   `SessionSnapshot`; the store mirrors it; the screen re-renders.
5. All writes go through one ordered queue; failures surface as `status: 'error'`.

## 5. Contracts and testing

- Data contracts: raw IMU samples and derived rep events per source-of-truth §7 and
  [ADR 0002](decisions/0002-sensor-contract-and-rep-detector.md); hardware side in
  [`hardware-protocol.md`](hardware-protocol.md).
- Shared suites any new implementation must pass:
  `describeSensorSourceContract` (`@repone/sensor-contracts/testing`) and
  `describeRepositoriesContract` (`@repone/workout-domain/testing`).
- Packages test with ts-jest under Node; the app tests with jest-expo. SQLite repositories are
  tested against Node's `node:sqlite` through the same `SqlDatabase` port used with expo-sqlite.
- `npm run verify` = boundaries + typecheck + all tests.

## 6. Multi-agent ownership (suggested in the Sprint 1 brief)

| Area | Paths | Suggested owner |
|---|---|---|
| Contracts (change only via ADR + all owners' review) | `packages/sensor-contracts/src/{common,sensor,derived}.ts` | Shared |
| Rep engine, automated tests, review | `packages/rep-engine/` | OpenAI Codex |
| Application architecture, integration, UI | `apps/mobile/`, `packages/workout-domain/` | Claude Code |
| Architecture evaluation, UX critique, hardware research | `docs/`, `docs/hardware-protocol.md` | Gemini |

Work on separate branches/worktrees; one owner per path at a time; tests + review before merge;
breaking interface changes require an ADR in `docs/decisions/`.
