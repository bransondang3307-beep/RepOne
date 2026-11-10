# Sprint 1 summary

- **Scope:** the alignment plan's Milestones 1–5 (`TASKS.md` RO-003 … RO-015) and the supporting tasks around them.
- **Status:** written for the Sprint 1 close-out (RO-015 PR 5.1, plan:
  [`docs/plans/RO-015-milestone-5-plan.md`](plans/RO-015-milestone-5-plan.md)).
  - Milestones 1 and 2, and the merged parts of Milestone 3 and RO-029, are cited by merge commit.
  - Pending merges are cited by PR and reviewed head. Their merge commits and the owner's device checks are recorded
    in [`PROJECT_STATUS.md`](../PROJECT_STATUS.md) at the close-out.
- **The rule this summary follows:** simulated, replayed, phone-tested and physical-sensor results are reported
  separately. **No result in Sprint 1 comes from a physical sensor.**

## 1. What was built

| Milestone / task | What | Where |
|---|---|---|
| **M1** (RO-003 … RO-007) | The module layout: contracts, simulation, rep engine, workout domain, persistence, mobile UI ([ADR 0003](decisions/0003-full-spec-module-layout.md)); boundary checker | [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3) `cd884fc`; closeout PRs #13 and #20 |
| **M2** (RO-012) | Sensor error states and reasons; channels by `source_id` with a per-channel rep-engine wrapper; the `DeviceConnection` contract and `SimulatedDevice`; app device integration ([ADR 0007](decisions/0007-sensor-errors-channels-device-connections.md), Accepted) | PRs #14 `9a42cf0`, #15 `9b93b32`, #16 `058bfe4`, #17 `f1df6b2` |
| **M3** (RO-013) | The workout domain: workout → exercise → set, machines with motion type, user-entered resistance, lifecycle ([ADR 0010](decisions/0010-workout-domain-model.md), Accepted) | [PR #33](https://github.com/bransondang3307-beep/RepOne/pull/33) `b5a8538` |
| | SQLite migration v2, workout repositories, recording outcome and per-rep `source_id`; history queries; file-backed v1 → v2 upgrade test | [PR #35](https://github.com/bransondang3307-beep/RepOne/pull/35), with #36 (Codex) and #40 |
| **M4** (RO-014) | Plan, with four owner decisions | [PR #34](https://github.com/bransondang3307-beep/RepOne/pull/34) `7de56f6` |
| | `WorkoutController`: lifecycle, recording a set, save-failure and stale-event handling | [PR #37](https://github.com/bransondang3307-beep/RepOne/pull/37) (design), [PR #45](https://github.com/bransondang3307-beep/RepOne/pull/45), reviewed head `a91a5a7` |
| | Workout flow UI: picker, resistance entry, recording, pause between sets, finish | [PR #46](https://github.com/bransondang3307-beep/RepOne/pull/46), reviewed head `10d9a58` |
| | Today's workout cards; History's workouts with set detail; "All sets" keeps standalone recordings | [PR #47](https://github.com/bransondang3307-beep/RepOne/pull/47), reviewed head `4c6eee7` |
| **M5** (RO-015) | Close-out plan, five owner decisions approved 2026-11-10; this summary and the docs sync | [PR #48](https://github.com/bransondang3307-beep/RepOne/pull/48); PR 5.1 |
| Expo SDK 58 (RO-031) and UI redesign (RO-030) | The current Expo Go; Today / Record / History in light and dark | [PR #29](https://github.com/bransondang3307-beep/RepOne/pull/29), [PR #30](https://github.com/bransondang3307-beep/RepOne/pull/30) |
| Real-sensor pipeline (RO-029), parts 1–2 | IMU stream wire protocol and codec ([ADR 0008](decisions/0008-imu-stream-wire-protocol.md), **Proposed**); Uno R3 USB firmware and serial-capture decoder; firmware → decoder stream regression | PRs #26 `75322ea`, #27 `3dbc051`, #41 `9664fc5` |
| Workflow at $0 extra AI cost (RO-019) | Claude Code ↔ Codex review through GitHub, no AI API keys; enforced in CI ([ADR 0005](decisions/0005-zero-cost-claude-codex-collaboration.md)) | [PR #11](https://github.com/bransondang3307-beep/RepOne/pull/11) `acb9857` |
| Windows (RO-021, RO-022) | Path-separator fix; a Windows CI job for the boundary checker | Fix in PR #3; [PR #10](https://github.com/bransondang3307-beep/RepOne/pull/10) `8a70565` |
| Other supporting tasks | Sync setup (RO-004, #1 `75e2814`, ADR 0004); naming rule (RO-020, #6 `81ccca6`, ADR 0006); dependency security (RO-027, #21 `4d6ce0c`); boundary hardening (RO-025, #25 `15471f5`); ownership table (RO-008, #42 `96862d3`); development-host report (RO-034, #44) | — |
| Reviews by other agents | Milestone 1 architecture review (RO-011, Gemini, #8 `f41309c`); Antigravity onboarding (Codex, #7 `b1c6ac1`); recording-to-history regression (Codex, #36) | — |

## 2. How it was verified

- **CI on every PR and on `main`:**
  - a Linux job: module boundaries, workflow policy (no AI API integrations), typecheck, all tests;
  - a Windows job: the boundary checker and its tests.
- **Independent review:** every code PR got a Codex review of its final head, with at most two fix rounds unless
  the owner allowed more. Findings were reproduced before fixing. For key regressions, the fix was reverted to
  confirm that its test fails.
- **Test counts** on the Milestone 4 candidate (`4c6eee7`, 2026-11-10):

  | Suite | Result |
  |---|---|
  | Jest, mobile | 173 |
  | Jest, rep engine | 27 |
  | Jest, sensor contracts | 103 |
  | Jest, sensor protocol | 76 |
  | Jest, workout domain | 38 |
  | Script tests | 124 |
  | Firmware host tests | 62 protocol, 16 driver (fake I²C bus), 9 decoder and boundary |
  | Exports | Android and iOS both pass |

  The final counts on `main` are recorded at the close-out.
- **Owner device checks** on an iPhone in Expo Go, with the simulated sensor:
  - Milestone 1 (RO-007);
  - Milestone 2 (2026-10-30, all seven steps passed);
  - the redesign, the Milestone 3 upgrade and the Milestone 4 acceptance, recorded in `PROJECT_STATUS.md` when run.

## 3. What is simulated only, or not verified

- **Rep counts:** every rep count in the app and the tests comes from **synthetic or replayed** motion. The rep
  detector's accuracy on real lifts is unknown.
- **Firmware:** compiled and host-tested against the shared golden packets and the app's decoder, but **never
  flashed**. The GY-521 / MPU-6050 is not physically verified.
- **Bluetooth:** no BLE link has run on a phone. The adapter (#28) is parked.
- **Resistance:** always **entered by the user**, never measured.
- **`expo-doctor`:** 18 of 20 checks pass. The other two need Expo's servers, which the build environment could not
  reach, and must be rerun where the network allows.
- **`npm audit --omit=dev`:** 8 moderate advisories, all through `glob` / `minimatch` in Expo's build tooling. The
  only fix npm offers is a downgrade (owner decision 4, 2026-11-10).

## 4. Carried to Sprint 2

These carry-overs follow the owner's decisions of 2026-11-10 (plan §5).

| Item | State |
|---|---|
| RO-029 part 3: the iPhone BLE adapter ([PR #28](https://github.com/bransondang3307-beep/RepOne/pull/28)) | Parked at its fix-round limit; needs hardware and a development build |
| Pause-aware rep detection, ADR 0009 Proposed ([PR #31](https://github.com/bransondang3307-beep/RepOne/pull/31)) | Parked; it changes rep counting, which needs real-data evidence |
| ADR 0008, the wire protocol | Stays Proposed until hardware evidence |
| RO-018: H0 hardware bring-up | The owner's (hardware) |
| RO-016: serial packet research | Needs re-scoping, since RO-029's protocol overlaps it |
| RO-024 brand configuration; RO-026 where simulation lives; RO-017 ESLint | `todo` |
| RO-009 license; RO-010 app layout in the source of truth | Owner decisions |
| RO-033: Codex's PR-coordination pilot ([PR #38](https://github.com/bransondang3307-beep/RepOne/pull/38)) | Waits for the owner's review |
| Expo tooling advisories; `expo-doctor` network checks | Recheck at each Expo patch, and where the network allows |
