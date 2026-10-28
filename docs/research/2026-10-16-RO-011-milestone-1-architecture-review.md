# RO-011 — Architecture Review of Milestone 1 Layout (`ADR 0003` / PR #3)

| Field | Value |
|---|---|
| **Task** | `RO-011` (`TASKS.md`) — Architecture review of Milestone 1 layout (ADR 0003) |
| **Reviewer** | Gemini (in Google Antigravity, research/architecture/design role) |
| **Date** | 2026-10-16 |
| **Base branch (`origin/main`)** | `75e2814a6edbd4bfa58f1c7032edc0245d9dd4e9` |
| **Reviewed target (PR #3 head)** | [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3) (`sprint-1-alignment` @ `40d4a223dc117f36baa567ee9211db8d64daa2c5`) |
| **Related ADRs** | [ADR 0001](../decisions/0001-app-stack-and-monorepo-layout.md), [ADR 0002](../decisions/0002-sensor-contract-and-rep-detector.md), `ADR 0003` (`docs/decisions/0003-full-spec-module-layout.md` on PR #3), [ADR 0004](../decisions/0004-multi-agent-synchronization.md), `ADR 0006` (proposed on open [PR #6](https://github.com/bransondang3307-beep/RepOne/pull/6) @ `aee034a`) |
| **Status** | Review complete — **0 blockers** for Milestone 1 merge; optional improvements and Milestone 2–4 safeguards documented below |

> **Data & Verification Honesty:** All sensor and repetition data in the repository remains **synthetic/simulated**. No real hardware sensor has been connected, and the owner's physical phone check in Expo Go (`RO-007`) remains a separate open acceptance gate before PR #3 merges.

---

## 1. Executive Summary & Verdict

The Milestone 1 restructure on `sprint-1-alignment` (`40d4a223dc117f36baa567ee9211db8d64daa2c5`) cleanly decomposes `@repone/core` into three pure-TypeScript packages (`@repone/sensor-contracts`, `@repone/rep-engine`, `@repone/workout-domain`) and reorganizes `apps/mobile` into `app/` (routes), `src/application/`, `src/features/`, `src/shared/`, and `src/infrastructure/` without altering repetition-detection algorithms, sensor units, or data provenance contracts.

Both issues identified in Codex's initial `RO-006` review were resolved on PR #3 in commits `2dae11b` and `40d4a22`:
1. `scripts/check-boundaries.mjs` now resolves `@repone/*` workspace imports (including `./testing` subpaths) into graph edges so cycles through package barrels are caught, backed by 7 regression tests in `scripts/check-boundaries.test.mjs`.
2. Controller × SQLite integration coverage was restored in `apps/mobile/src/infrastructure/database/__tests__/WorkoutSessionController.sqlite.test.ts`.

**Verdict:** **No architectural blockers remain for merging PR #3 once the owner's `RO-007` Expo Go check passes.** Below is the detailed analysis across the four required review areas, ranked into **Blockers (0)**, **Optional Improvements**, and **Future Concerns (Milestones 2–4)**.

---

## 2. Dependency Direction & Boundary Enforcement

### 2.1 Observed Architecture on PR #3 (`40d4a22`)

The dependency graph enforced by `scripts/check-boundaries.mjs` and documented in `docs/architecture.md` §3 is unidirectional and acyclic:

```text
apps/mobile/app/* (Routes)
  ──► apps/mobile/src/features/* (index.ts)
  ──► apps/mobile/src/shared/index.ts
  ──► apps/mobile/src/application/index.ts
        │
        ├──► apps/mobile/src/application/services/* (WorkoutSessionController)
        │      ──► @repone/workout-domain ──► @repone/sensor-contracts
        │      ──► @repone/sensor-contracts
        │
        └──► (Composition Root: createAppContainer.ts)
               ──► @repone/rep-engine ──► @repone/sensor-contracts
               ──► apps/mobile/src/infrastructure/database/index.ts
                     ──► @repone/workout-domain, @repone/sensor-contracts, expo-sqlite
```

Key strengths verified by code inspection:
* **Bottom contract layer is leaf-only:** `packages/sensor-contracts/package.json` has `"dependencies": {}`, and `PACKAGE_DEPS['sensor-contracts'] = []` in `scripts/check-boundaries.mjs` prevents any upward dependency.
* **Sibling isolation between Domain and Engine:** `@repone/rep-engine` (`packages/rep-engine/package.json`) and `@repone/workout-domain` (`packages/workout-domain/package.json`) each depend only on `@repone/sensor-contracts`. Placing derived contracts (`RepEvent`, `RepCalibration`, `MotionDetector`) in `packages/sensor-contracts/src/derived.ts` (`ADR 0003` Decision 1) allows `workout-domain` to persist events and calibrations without importing `rep-engine`.
* **Platform independence of packages and application services:** `PLATFORM_LIB` in `scripts/check-boundaries.mjs` blocks `react`, `react-native`, `zustand`, `expo*`, `*sqlite*`, and `*ble*`/`*bluetooth*` from `packages/*` and `apps/mobile/src/application/services/*`.
* **Composition root isolation:** Only `apps/mobile/src/application/createAppContainer.ts` imports `apps/mobile/src/infrastructure/database`. Routes (`apps/mobile/app/_layout.tsx`, `index.tsx`, `history.tsx`) and features (`apps/mobile/src/features/rep-tracking/`, `apps/mobile/src/features/workouts/`) consume services exclusively via `useAppServices()` (`apps/mobile/src/application/AppServicesProvider.tsx`) and never import `infrastructure/`.
* **No module-level store singletons:** `apps/mobile/src/features/rep-tracking/useLiveSession.ts` scopes `LiveSessionStore` instances per `AppContainer` via `new WeakMap<AppContainer, LiveSessionStore>()`, preventing cross-test or hot-reload state bleed.

### 2.2 Boundary Checker Edge Cases (Optional Improvements / Future Hardening)

1. **Windows path separator normalization in `scripts/check-boundaries.mjs` (Important for Windows contributors):**
   * **Evidence:** In `scripts/check-boundaries.mjs`, `const rel = relative(ROOT, file)` and `const trel = relative(ROOT, target)` use `node:path`'s `relative()`. On POSIX (Linux/macOS, including GitHub Actions `ubuntu-latest`), `relative()` returns forward slashes (`/`), matching the regexes in `isTest` (`/(__tests__|\/test\/|\.test\.tsx?$)/`), `layerOf` (`/^packages\/([^/]+)\//`, `rel.startsWith('apps/mobile/app/')`), and `isLayerIndex` (`/^apps\/mobile\/src\/(application|shared|features\/[^/]+|infrastructure\/[^/]+)\/index\.tsx?$/`).
   * **Issue on Windows:** On native Windows Node (`process.platform === 'win32'`), `path.relative()` returns backslash-separated paths (e.g., `packages\sensor-contracts\src\index.ts`). Because `layerOf()` and `isLayerIndex()` match against `/`, on Windows `layerOf(rel)` falls through to `{ kind: 'other' }`, silently skipping layer boundary checks and causing `scripts/check-boundaries.test.mjs` assertions (which check forward-slash paths and layer rules) to fail when run locally on Windows.
   * **Recommendation (Non-blocking for PR #3 on Linux CI, high value for Windows local dev):** Normalize `relative(ROOT, p).replaceAll('\\', '/')` (or use `path.posix` after normalizing separators) in `scripts/check-boundaries.mjs` so `npm run check:boundaries` and `npm run test:scripts` behave identically on Windows (`Lenovo Windows laptop`) and Linux CI.
2. **Cross-infrastructure adapter isolation (Milestone 2 preparation):**
   * **Evidence:** In `scripts/check-boundaries.mjs`, `layerOf(rel)` returns `{ kind: 'infrastructure' }` without capturing the adapter subdirectory name (`database`, and in Milestone 2 `bluetooth` / `sensors`),whereas `features` captures `{ kind: 'feature', name: m[1] }`. Consequently, `sameLayer` (`from.kind === to.kind && from.name === to.name`) evaluates to `true` (`'infrastructure' === 'infrastructure' && undefined === undefined`) across *different* `infrastructure/<x>` subdirectories, even though `isLayerIndex` already anticipates `infrastructure/[^/]+/index.ts`.
   * **Recommendation:** Before or during `RO-012` (Milestone 2, which adds `src/infrastructure/bluetooth/` or `src/infrastructure/sensors/`), update `layerOf()` in `scripts/check-boundaries.mjs` to capture `name` for `apps/mobile/src/infrastructure/([^/]+)/` so `infrastructure/bluetooth` cannot import internals of `infrastructure/database`.
3. **Composition-root vs. general `application/` imports:**
   * **Evidence:** `scripts/check-boundaries.mjs` allows any file classified as `{ kind: 'application' }` (`apps/mobile/src/application/*.ts`) to import `infrastructure/<x>` without requiring `viaIndex`. Right now only `createAppContainer.ts` imports `../infrastructure/database` (via its barrel), which matches `docs/architecture.md` §3.
   * **Recommendation:** Optional tightening in `check-boundaries.mjs`: require `!viaIndex` check when `from.kind === 'application'` imports `to.kind === 'infrastructure'`, ensuring `application/` only ever consumes `infrastructure/<x>/index.ts`.

---

## 3. Placement of Simulation (Module B) Inside `@repone/sensor-contracts`

### 3.1 Current Placement and Evidence

In `ADR 0003` Decision 1, Module B (`packages/sensor-contracts/src/simulation/`: `prng.ts`, `motion.ts`, `scripts.ts`, `SimulatedSensorSource.ts`, `ReplaySensorSource.ts`) is hosted inside `@repone/sensor-contracts` and re-exported from `packages/sensor-contracts/src/index.ts`.

* **Size & dependency footprint:** The entire `src/simulation/` directory is 5 pure-TypeScript files (~310 lines total) with **zero external runtime dependencies** and no large static JSON fixtures (`LABELLED_SET_SCRIPT` and `DEMO_LOOP_SCRIPT` in `scripts.ts` are compact segment descriptors; samples are synthesized on demand).
* **Runtime usage in Milestone 1:** The mobile app (`apps/mobile/src/application/createAppContainer.ts`) actively uses `SimulatedSensorSource`, `DEMO_LOOP_SCRIPT`, and `createSyntheticCalibration` at runtime for the Sprint 1 simulated workout screen. Therefore, in Sprint 1, simulation code is intentionally part of the mobile runtime bundle, and there is **no evidence of unintended bundle bloat**.

### 3.2 Trade-offs and Evolution Path

* **Why keeping Simulation in `@repone/sensor-contracts` is right for Sprint 1:**
  1. Both `@repone/rep-engine` tests (`packages/rep-engine/test/fixtures.ts`), `@repone/workout-domain` contract tests (`packages/workout-domain/src/testing/repositoriesContract.ts`), and `apps/mobile` need deterministic synthetic traces and `SimulatedSensorSource`.
  2. Avoiding a fourth workspace package (`@repone/sensor-simulation`) keeps workspace configuration and dependency graphs minimal while all data in Sprint 1 is simulated.
* **Conceptual coupling to watch in Milestones 2–3:**
  1. `packages/sensor-contracts/src/simulation/scripts.ts` defines `DEMO_FULL_ROM_RAD` and `createSyntheticCalibration()`, which constructs a `RepCalibration` specific to rotational gym movement (`axis: 0`, `full_rom_rad`). As new activity detectors or multi-channel contracts arrive (`RO-012`), keeping activity-specific demo scripts in the root barrel of `@repone/sensor-contracts` mixes pure interface contracts with synthetic fixture data.
  2. **Future recommendation (non-blocking):** If `src/simulation/` grows in Milestone 2/3 (e.g., multi-channel simulation scripts, error-injection scripts, or recorded H0 bench traces), expose it via a subpath export (`@repone/sensor-contracts/simulation`) or extract `@repone/sensor-simulation` before production H1/H2 builds so pure contract consumers (`@repone/workout-domain`, hardware adapters) only import interfaces from `@repone/sensor-contracts`.

---

## 4. Shared Contract Suites (`*/testing`)

### 4.1 Current Coverage on PR #3

PR #3 introduces two reusable contract test suites exported via `package.json` `exports["./testing"]` and guarded by `scripts/check-boundaries.mjs` (`if (sub === '/testing' && !test && !rel.includes('/src/testing/')) fail(...)`):

1. **`describeSensorSourceContract` (`packages/sensor-contracts/src/testing/sensorSourceContract.ts`):**
   * Exercised against `SimulatedSensorSource` and `ReplaySensorSource (realtime)` in `packages/sensor-contracts/test/sensorSources.test.ts`.
   * Verifies: initial `'idle'` status, transition to `'streaming'` on `start()`, delivery of $\ge 45$ samples over $1000\text{ ms}$ in non-decreasing `timestamp_ms` order, clean stop with no further samples after `stop()`, listener unsubscription, and transition to `'stopped'` when a finite stream completes (`advance(60_000)`).
2. **`describeRepositoriesContract` (`packages/workout-domain/src/testing/repositoriesContract.ts`):**
   * Exercised against `createInMemoryRepositories()` (`packages/workout-domain/test/inMemoryRepositories.test.ts`) and SQLite via `node:sqlite` (`apps/mobile/src/infrastructure/database/__tests__/sqliteRepositories.test.ts`).
   * Verifies: calibration save/get round-trip, session creation/ending/lookup, lossless ordered batch raw-sample persistence, and rep-event persistence with summary aggregation (`full_rep_count`, `partial_rep_count`) ordered most-recent-first.

### 4.2 Contract Suite Gaps & Recommendations for Milestone 2 (`RO-012`) and Milestone 3 (`RO-013`)

1. **`describeSensorSourceContract` assumes a ~50 Hz finite stream ending within 60 seconds:**
   * **Evidence:** `sensorSourceContract.ts` hardcodes `advance(1000)` expecting `samples.length >= 45`, and `advance(60_000)` expecting `source.getStatus() === 'stopped'`.
   * **Impact on `RO-012` / H0:** A continuous live source (like `SimulatedSensorSource` with `DEMO_LOOP_SCRIPT` where `loop: true`, or a real streaming USB/BLE sensor) does not self-terminate at 60 s, and `ReplaySensorSource` in `'immediate'` mode emits all samples synchronously inside `start()` before `advance(1000)` is called (which is why `sensorSources.test.ts` only runs `describeSensorSourceContract` on `ReplaySensorSource (realtime)` and tests `'immediate'` mode separately).
   * **Recommendation for `RO-012`:** Parameterize `SensorSourceHarness` options in `describeSensorSourceContract` (e.g., `expectedMinSamplesPerSec`, `finiteStream: boolean`) and add contract assertions for:
     * Idempotent `start()` / `stop()` calls (calling `stop()` when already `'idle'` or `'stopped'`).
     * Status listener unsubscribe behavior (`subscribeStatus` return function is not yet asserted in `sensorSourceContract.ts`).
     * Error-state transitions (`status === 'error'`) planned in `RO-012`.
2. **TypeScript `moduleResolution` compatibility for `./testing` subpaths:**
   * **Evidence:** Package `tsconfig.json` files use `"moduleResolution": "Bundler"`, which resolves `package.json` `"exports"`. `apps/mobile/tsconfig.json` extends `expo/tsconfig.base` (which also uses bundler/modern resolution in Expo SDK 57). This works cleanly across all 4 workspaces.

---

## 5. Multi-Agent File Ownership, Contention Risks & Rebrandability (`RO-020`)

### 5.1 Documentation Discrepancy to Resolve in `RO-008` (Already Tracked)

1. **`docs/architecture.md` §6 vs. `AGENTS.md` §2:**
   * **Evidence:** On PR #3 (`40d4a22`), `docs/architecture.md` §6 ("Multi-agent ownership") lists `OpenAI Codex` as the suggested owner of `packages/rep-engine/`. As noted in `TASKS.md` (`RO-008`) and `docs/handoffs/2026-10-15-claude-RO-005.md`, `AGENTS.md` §2 establishes that Claude Code is the main software developer across packages while Codex is dedicated to testing, debugging, and independent code review.
   * **Action:** Already tracked as `RO-008` (depends on `RO-003` merged). Do not edit PR #3 for this now; execute `RO-008` immediately after PR #3 merges.
2. **`apps/mobile/AGENTS.md` boilerplate path discrepancy (Noted in PR #7):**
   * **Evidence:** `apps/mobile/AGENTS.md` (Expo template file) states `"Routes belong in the src/app directory"`, whereas the actual Expo Router routes in RepOne live in `apps/mobile/app/` (`_layout.tsx`, `index.tsx`, `history.tsx`) and `scripts/check-boundaries.mjs` explicitly checks `apps/mobile/app/`.
   * **Action:** When `RO-008` updates architecture ownership docs after PR #3 merges, either update or add a note to `apps/mobile/AGENTS.md` clarifying that routes live in `apps/mobile/app/` so no agent attempts to move `apps/mobile/app/` into `apps/mobile/src/app/`.

### 5.2 Parallelism & Merge-Conflict Hotspots for Milestones 2–4

Even with package separation, four files/areas are high-contention bottlenecks if multiple tasks run concurrently:

| Hotspot File / Area | Why It Contends | Mitigation Recommendation |
|---|---|---|
| `TASKS.md` & `PROJECT_STATUS.md` | Every PR and status update touches `TASKS.md` (currently modified concurrently across open PRs #2, #3, #5). | Strictly follow PR #2 (`claude/RO-004-owner-decision`) and PR #7 (`codex/RO-004-antigravity-onboarding`): do not edit `TASKS.md` on documentation/research branches when open PRs already own board updates; update task rows in small, dedicated status PRs after merge. |
| `apps/mobile/src/application/createAppContainer.ts` & `application/index.ts` | Composition root wires every new repository (`RO-013`), device manager (`RO-012`), and service (`RO-014`). | Keep `RO-012` → `RO-013` → `RO-014` strictly sequential as defined in `TASKS.md`. Never run two implementation branches that both modify `createAppContainer.ts` in parallel. |
| `apps/mobile/src/infrastructure/database/migrations.ts` | `MIGRATIONS` is an ordered array of SQL strings indexed by `PRAGMA user_version`. Parallel branches adding `MIGRATIONS[1]` will silently collide on schema version `2`. | Only one branch at a time may append to `MIGRATIONS` (`RO-013` owns Milestone 3 schema additions). |
| Package barrel files (`packages/*/src/index.ts`) | Every contract or domain addition re-exports through `src/index.ts`. | Keep contract changes in `@repone/sensor-contracts` confined to `RO-012` before starting `RO-013`. |

### 5.3 Alignment with Proposed Rebrandable Naming Rules (Open PR #6 — `RO-020` / `ADR 0006`)

Open [PR #6](https://github.com/bransondang3307-beep/RepOne/pull/6) (`aee034a`, **unmerged / proposed**) introduces `ADR 0006` so the temporary development name `"RepOne"` can be replaced cleanly later. Evaluating PR #3 (`40d4a22`) against PR #6's proposed design confirms:
* **Core packages are already 100% brand-free at runtime:** `@repone/sensor-contracts`, `@repone/rep-engine`, and `@repone/workout-domain` contain zero user-facing brand strings (`@repone/*` is an internal npm workspace scope classified under technical identifiers in proposed `ADR 0006`).
* **`apps/mobile/src/shared/` is ready to host `brand.ts`:** PR #3 creates `apps/mobile/src/shared/index.ts` and enforces via `scripts/check-boundaries.mjs` that routes (`apps/mobile/app/_layout.tsx`, where `title: 'RepOne'` currently lives on line 26) may import `../src/shared`. Once PR #3 and PR #6 merge, Claude's proposed `RO-020` follow-up can drop `apps/mobile/src/shared/brand.ts` into `src/shared/` with zero boundary rule changes.
* **Draft H0 Serial Header in `docs/hardware-protocol.md`:** Line 32 of `docs/hardware-protocol.md` on PR #3 proposes `# repone h0 v1 accel_range_g=2 gyro_range_dps=250 rate_hz=50`. Under proposed `ADR 0006` §3, wire-format magic headers should use neutral identifiers (e.g., `# imu-stream h0 v1 ...`). This should be addressed in `RO-016` (H0 serial schema research) after PR #3 merges rather than holding up PR #3.

---

## 6. Ranked Findings Summary & Actionable Follow-ups for Claude Code

| Rank | Category | Finding | Target Task / When to Address |
|---|---|---|---|
| **1** | **Optional Improvement (Tooling / Windows Dev)** | **Normalize path separators in `scripts/check-boundaries.mjs`:** `path.relative()` returns `\` on Windows, causing regexes in `layerOf()`, `isLayerIndex()`, and `isTest()` to miss layer classifications when run natively on Windows PowerShell. Normalize with `.replaceAll('\\', '/')`. | Follow-up in `RO-008` or start of `RO-012` (does not block PR #3 merge; Linux CI is unaffected). |
| **2** | **Future Concern (Milestone 2 — `RO-012`)** | **Sub-folder isolation in `src/infrastructure/<adapter>`:** Update `layerOf()` in `scripts/check-boundaries.mjs` to capture `{ kind: 'infrastructure', name: m[1] }` so `infrastructure/bluetooth` and `infrastructure/database` cannot import each other's internal files. | Claude Code in `RO-012` when adding device-connectivity infrastructure. |
| **3** | **Future Concern (Milestone 2 — `RO-012`)** | **Extend `describeSensorSourceContract` for error states, idempotency, and non-50Hz / continuous streams:** Add `subscribeStatus` unsubscribe assertions, error-state transition tests, and configurable rate/duration expectations to `packages/sensor-contracts/src/testing/sensorSourceContract.ts`. | Claude Code in `RO-012`. |
| **4** | **Optional Improvement (Docs Alignment — `RO-008`)** | **Reconcile `docs/architecture.md` §6 and `apps/mobile/AGENTS.md`:** Align `docs/architecture.md` §6 ownership table with `AGENTS.md` §2 (`RO-008`), and add a one-line note to `apps/mobile/AGENTS.md` that routes live in `apps/mobile/app/` (not `src/app/`). | Claude Code in `RO-008` (immediately after PR #3 merges). |
| **5** | **Future Concern (Rebrandability — Proposed `RO-020` / `RO-016`)** | **Centralize mobile display brand & keep H0 wire format brand-neutral:** After PR #3 and PR #6 merge, add `apps/mobile/src/shared/brand.ts` (`RO-020`) and use a brand-neutral header in `docs/hardware-protocol.md` during `RO-016`. | `RO-020` (Claude Code) and `RO-016` (Gemini) after PR #3 merges. |
