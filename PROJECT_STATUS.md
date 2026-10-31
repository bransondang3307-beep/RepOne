# RepOne — Project Status

> **Rule:** "Verified on `main`" lists only work that is **merged into `main` and verified**, with the
> evidence. Unmerged work goes under "Open branches / PRs". Update this file in a PR only after the
> change it describes has merged. By default the agent that completed the work does so; Claude Code may also
> record the owner's device checks, Codex review tasks and owner-directed closeouts (`AGENTS.md` §3 step 9).
> Status words: see `AGENTS.md` §4.

| | |
|---|---|
| **Last updated** | 2026-10-31 by Claude Code: the Milestone 2 closeout, as directed by the owner (PRs #21 and #14–#17 merged after the owner's device acceptance; ADR 0007 Accepted) |
| **`main` at** | `f1df6b2` — "Merge PR #17: RO-012 part 4, app device integration; RO-023 badge fix" |
| **CI on `main`** | GitHub Actions `CI` on every push and PR: Linux `verify` (boundaries, workflow policy, typecheck, tests) and a Windows job (boundary checker + script tests); handoff check on PRs. Last run on `main`: [41148527229](https://github.com/bransondang3307-beep/RepOne/actions/runs/41148527229) on `f1df6b2` — Linux ✅, Windows ✅ (the handoff check runs on PRs only) |
| **Current phase** | Sprint 1. **Milestone 1 is closed out. Milestone 2 (RO-012) is done:** merged on 2026-10-31 after the owner's iPhone check on 2026-10-30, with ADR 0007 Accepted. The dependency patch (RO-027) is merged too. **The owner's priority is now the real-sensor BLE pipeline (RO-029)** (owner direction, 2026-10-31), ahead of further workout and UI milestones. RO-013 (Milestone 3) has a written plan and is not started. Sprint 2 **not started**. |
| **Hardware** | No real sensor connected to the software yet (source of truth §2). All rep data is simulated. RO-029 prepares the software path; the MPU-6050 and the wireless board are not physically verified or selected. |
| **AI cost** | **$0 additional AI API spending** (owner rule, ADR 0005): subscriptions only, no AI API keys or paid AI services; enforced in CI by `npm run check:workflows` |

## Merged into `main`

| Date (UTC) | PR | Merge commit | Task(s) | CI on `main` after the merge |
|---|---|---|---|---|
| 2026-10-15 | [PR #1](https://github.com/bransondang3307-beep/RepOne/pull/1) | `75e2814` | **RO-004** multi-agent sync setup — **done** | [38807737485](https://github.com/bransondang3307-beep/RepOne/actions/runs/38807737485) ✅ |
| 2026-10-17 | [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3) | `cd884fc` | **RO-003 / RO-005** Milestone 1 module layout — **done** (with RO-006 review and RO-007 device check) | [38986550607](https://github.com/bransondang3307-beep/RepOne/actions/runs/38986550607) ✅ |
| 2026-10-21 | [PR #11](https://github.com/bransondang3307-beep/RepOne/pull/11) | `acb9857` | **RO-019** Claude Code ↔ Codex workflow at $0 additional AI API cost — **done** | [39522348555](https://github.com/bransondang3307-beep/RepOne/actions/runs/39522348555) ✅ |
| 2026-10-22 | [PR #10](https://github.com/bransondang3307-beep/RepOne/pull/10) | `8a70565` | **RO-022** Windows CI job for the boundary checker — **done** | [39701367400](https://github.com/bransondang3307-beep/RepOne/actions/runs/39701367400) ✅ |
| 2026-10-22 | [PR #12](https://github.com/bransondang3307-beep/RepOne/pull/12) | `9b8b81a` | RO-019 / RO-022 status update (docs) | [39850789506](https://github.com/bransondang3307-beep/RepOne/actions/runs/39850789506) ✅ |
| 2026-10-28 | [PR #13](https://github.com/bransondang3307-beep/RepOne/pull/13) | `ad7e047` | **RO-003…RO-007** Milestone 1 closeout; RO-023 recorded (docs, owner-directed) | [40740559028](https://github.com/bransondang3307-beep/RepOne/actions/runs/40740559028) ✅ |
| 2026-10-28 | [PR #19](https://github.com/bransondang3307-beep/RepOne/pull/19) | `2959751` | **RO-004 follow-up:** status-update ownership (owner decision of 2026-10-28) and ADR 0004 Accepted (docs); supersedes PR #2 | [40762889708](https://github.com/bransondang3307-beep/RepOne/actions/runs/40762889708) ✅ |
| 2026-10-28 | [PR #9](https://github.com/bransondang3307-beep/RepOne/pull/9) | `4951a37` | **RO-021** record: the Windows path fix (merged in `cd884fc`) marked done (docs) | [40765879014](https://github.com/bransondang3307-beep/RepOne/actions/runs/40765879014) ✅ |
| 2026-10-28 | [PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8) | `f41309c` | **RO-011** Milestone 1 architecture review (Gemini; a dated record of `40d4a22`) — **done** | [40767477040](https://github.com/bransondang3307-beep/RepOne/actions/runs/40767477040) ✅ |
| 2026-10-28 | [PR #6](https://github.com/bransondang3307-beep/RepOne/pull/6) | `81ccca6` | **RO-020** rebrandable naming rule (`AGENTS.md` §5) and ADR 0006 — **done**; RO-024 recorded | [40767822488](https://github.com/bransondang3307-beep/RepOne/actions/runs/40767822488) ✅ |
| 2026-10-28 | [PR #7](https://github.com/bransondang3307-beep/RepOne/pull/7) | `b1c6ac1` | RO-004 follow-up: Antigravity onboarding (Codex; refreshed by Claude Code at the owner's direction) | [40768087759](https://github.com/bransondang3307-beep/RepOne/actions/runs/40768087759) ✅ |
| 2026-10-29 | [PR #20](https://github.com/bransondang3307-beep/RepOne/pull/20) | `b477c71` | Milestone 1 closeout status update (docs, owner-directed) | [40826334604](https://github.com/bransondang3307-beep/RepOne/actions/runs/40826334604) ✅ |
| 2026-10-31 | [PR #21](https://github.com/bransondang3307-beep/RepOne/pull/21) | `4d6ce0c` | **RO-027** dependency security patch (Expo SDK 57.0.31 line, `node-forge` 1.4.2) — **done** | [41147866259](https://github.com/bransondang3307-beep/RepOne/actions/runs/41147866259) ✅ |
| 2026-10-31 | [PR #14](https://github.com/bransondang3307-beep/RepOne/pull/14) | `9a42cf0` | **RO-012** part 1: sensor error states, contract-suite hardening, session failure handling | [41148049113](https://github.com/bransondang3307-beep/RepOne/actions/runs/41148049113) ✅ |
| 2026-10-31 | [PR #15](https://github.com/bransondang3307-beep/RepOne/pull/15) | `9b93b32` | **RO-012** part 2: channels and the per-channel rep-engine wrapper | [41148218361](https://github.com/bransondang3307-beep/RepOne/actions/runs/41148218361) ✅ |
| 2026-10-31 | [PR #16](https://github.com/bransondang3307-beep/RepOne/pull/16) | `058bfe4` | **RO-012** part 3: `DeviceConnection` contract, `SimulatedDevice`, device contract suite | [41148386831](https://github.com/bransondang3307-beep/RepOne/actions/runs/41148386831) ✅ |
| 2026-10-31 | [PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17) | `f1df6b2` | **RO-012** part 4: app device integration — **RO-012 done**; **RO-023** badge fix — **done** | [41148527229](https://github.com/bransondang3307-beep/RepOne/actions/runs/41148527229) ✅ |

`TASKS.md` marks RO-003…RO-007, RO-011, RO-012, RO-019…RO-023 and RO-027 `done`, with the evidence under each task.
- **RO-006** (assigned to Codex) and **RO-007** (assigned to the owner) were reconciled by Claude Code at the owner's
  request (2026-10-23), from the reviews and the device result recorded on PR #3. Under the rule merged with PR #19,
  such updates are an allowed exception (`AGENTS.md` §3 step 9).
- **RO-011** (assigned to Gemini) is recorded by Claude Code under the owner-directed closeout exception.
- **Reviews of the 2026-10-28 merges.** Codex found no major issues on each merged head:
  - PR #13 at `8cfeb0d`;
  - PR #19 at `31908a2`, after one P2 at `2cca7bd` was fixed;
  - PR #9 at `27f9f70`, PR #8 at `d6ec607`, PR #6 at `4fa9a9f` and PR #7 at `a46e5d4`.

  The owner authorised each merge (PR #19 by its exact commit; PRs #9, #8, #6 and #7 in the closeout batch). Each was
  pinned to the verified head and followed by a passing `main` CI run before the next merge.
- **Reviews and gates of the 2026-10-31 merges.** Codex found no major issues on each merged head:
  - PR #21 at `75dcf5a`;
  - PR #14 at `44ed65e`, PR #15 at `c79a42d`, PR #16 at `3d15246` and PR #17 at `cb0e025`. These are the heads
    refreshed against `main` @ `b477c71`; the refresh changed records only, not code.

  The owner tested integration candidate `fe41d47` (#17's head merged with #21's) on an iPhone on 2026-10-30. All
  seven checklist steps passed, and the owner then authorised the merges. Each merge was pinned to its verified head
  and followed by a passing `main` CI run before the next. After the last one, `main`'s code and lockfile equal the
  tested candidate.
- **[PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2) closed unmerged** on 2026-10-28 as superseded by PR #19, after CI passed on `main`
  ([closing comment](https://github.com/bransondang3307-beep/RepOne/pull/2#issuecomment-6479887030)). Its branch is kept as history.

## Verified on `main`

Evidence:
- **This session, 2026-10-31.** Worktree of `main` @ `f1df6b2` with this PR's docs-only changes, Node 22.22.0,
  `npm ci`, then `npm run verify` (exit 0):
  - Module boundaries OK (74 files, no circular imports).
  - Workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files).
  - Typecheck OK in all four workspaces.
  - Script tests **62/62**.
  - Jest **165/165**: `@repone/mobile` 31, `@repone/rep-engine` 27, `@repone/sensor-contracts` 103, `@repone/workout-domain` 4.
- **Device: Milestone 2, 2026-10-30.** The owner ran integration candidate `fe41d47` in Expo Go on an iPhone. All seven
  checklist steps passed:
  - launch with the full simulated-data warning;
  - connect and disconnect;
  - a simulated set saves;
  - connection loss and recovery;
  - History;
  - navigation and reload;
  - no runtime or native-module errors.

  `main` @ `f1df6b2` has the same code and lockfile as `fe41d47` (`git diff` is empty), so the check covers the merged
  app. Evidence: [comment on PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17#issuecomment-6536155158).
  The owner also reported that the top of the home screen starts under the translucent title bar (**RO-028**).
  **Simulated data only:** this says nothing about real sensors or rep accuracy.
- **Native Windows, the owner's Lenovo laptop, `main` @ `b1c6ac1`, 2026-10-28** (before Milestone 2 merged). Node v24.22.0, npm 11.19.1,
  `npm.cmd ci`, then `npm.cmd run verify` (exit 0): boundaries OK (58 files), workflow policy OK, typecheck OK in all
  four workspaces, script tests **62/62**, Jest **48/48** (15 · 16 · 13 · 4).
  - Antigravity reported this result after PR #7 merged; its temporary worktree was removed.
  - Claude Code re-ran it independently on the same laptop, in a detached worktree of `b1c6ac1`, with the same result.
  - This is a local run, not CI. It does not repeat the iPhone check (RO-007) and adds no hardware evidence.
- **Milestone 1 at its merge commit `cd884fc`,** re-run on 2026-10-23: `npm run verify` exit 0. Boundaries OK, checker
  tests 8/8, typecheck OK, Jest 48/48.
- **CI.** Run 41148527229 on `f1df6b2` passed on both Linux (Node 22) and Windows (Node 24). So did every earlier
  `main` run in the table above.
- **Device: RO-007, 2026-10-16.** The owner ran Expo Go on an iPhone against the `sprint-1-alignment` branch
  ([result](https://github.com/bransondang3307-beep/RepOne/pull/3#issuecomment-6227338609)):
  - The app launched and counted simulated reps.
  - Stopping a set saved it, and the set appeared in History.
  - It was still in History after the app was restarted.
  - The comment names the branch, not a commit. `apps/` and `packages/` are identical at every PR #3 head from
    `40d4a22` to `6f48f1d` and at the merge `cd884fc`, so the check covers the merged app code.
  - This validates the **simulated** workflow and on-device persistence, **not** physical sensor performance or
    real rep-detection accuracy.
- **Review: RO-006.** Codex approved PR #3's final head `6f48f1d` in a written review with test output. Its first
  review's two P2 findings were fixed in `2dae11b`.

| Feature | Location on `main` | Verified by |
|---|---|---|
| Sensor contracts (`SensorSource`, samples, derived data) with a shared contract test suite | `packages/sensor-contracts/src/` (`testing/` for the suite) | `sensorSources.test.ts` |
| Sensor error states and reasons; session failure handling (ADR 0007 §1, RO-012) | `packages/sensor-contracts/src/sensor.ts`; `apps/mobile/src/application/services/` | contract suite failure tests; `WorkoutSessionController` tests |
| Channels by `source_id`, `combineChannels`; per-channel rep engine `MultiChannelRepDetector` (ADR 0007 §2–3) | `packages/sensor-contracts/src/channels.ts`; `packages/rep-engine/src/` | channel and channel-independence tests — **synthetic data only** |
| `DeviceConnection` contract, `SimulatedDevice`, device contract suite (ADR 0007 §4) | `packages/sensor-contracts/src/device.ts`, `src/simulation/`, `src/testing/` | device suite; iPhone check 2026-10-30 (simulated device) |
| App device integration: connection panel, simulate-connection-loss test control | `apps/mobile/src/features/device-connection/`, `app/index.tsx` | `deviceConnectionStore.test.ts`; iPhone check 2026-10-30 |
| Seeded synthetic motion; simulated and replay sources | `packages/sensor-contracts/src/simulation/` | `simulation.test.ts`, `sensorSources.test.ts` — **synthetic data only** |
| Rotational rep detector (FSM), full/partial classification, calibration, rep evaluation | `packages/rep-engine/src/` | `rotationalRepDetector`, `calibration`, `evaluateReps` tests — **synthetic data only** |
| Workout session and repository ports; in-memory repositories with a contract suite | `packages/workout-domain/src/` | `inMemoryRepositories.test.ts` |
| SQLite persistence (expo-sqlite adapter, migrations) | `apps/mobile/src/infrastructure/database/` | `sqliteRepositories`, `WorkoutSessionController.sqlite` tests (`node:sqlite`); iPhone via RO-007 |
| Application services (`WorkoutSessionController`, composition root) | `apps/mobile/src/application/` | `WorkoutSessionController.test.ts` |
| Mobile UI: simulated active set and history (expo-router), live-session store, provenance badge | `apps/mobile/app/`, `src/features/`, `src/shared/` | `liveSessionStore.test.ts`, `ProvenanceBadge.test.tsx`; typecheck; iPhone via RO-007 and on 2026-10-30 (badge fixed, RO-023; header overlap: RO-028) |
| Module boundary checker | `scripts/check-boundaries.mjs` | `check-boundaries.test.mjs`; CI on Linux and Windows |
| Workflow policy check: no AI API integrations, least-privilege permissions (RO-019) | `scripts/check-workflow-policy.mjs`, `.github/workflow-policy.json` | `check-workflow-policy.test.mjs`; CI "Workflow policy" step |
| CI: Linux verify, Windows script checks (RO-022), handoff check | `.github/workflows/ci.yml` | Runs listed above |
| Agent workflow: shared rules, task board, handoffs, PR template, Claude Code ↔ Codex review hand-off, status-update ownership (owner decision of 2026-10-28), rebrandable naming rule (ADR 0006), Antigravity onboarding | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `ANTIGRAVITY.md`, `docs/agents/`, `TASKS.md`, `docs/handoffs/`, `docs/automation/` | Docs; Codex reviews ran on PRs #3, #6–#13 and #19 |
| Architecture, hardware protocol, ADRs 0001–0007 (ADR 0004 Accepted, Decision 4 amended 2026-10-28; ADR 0006 Accepted; ADR 0007 Accepted 2026-10-30); Milestone 1 architecture review (RO-011, dated 2026-10-16); RO-013 plan | `docs/architecture.md`, `docs/hardware-protocol.md`, `docs/decisions/`, `docs/research/`, `docs/plans/` | Docs |

**Implemented but not verified:**
- No Android device run is recorded. Only `expo export` bundles were built, in RO-005.
- No native Windows `npm run verify` has been run on `f1df6b2`. The last native runs were `main` @ `b1c6ac1` and
  PR #17's earlier head `3de7aa3` (2026-10-28), which has the same code apart from RO-027's dependency patch.
- Expo Go's built-in native gesture, animation and worklets libraries are older than the versions the app's code
  resolves (RO-027 handoff). The 2026-10-30 check showed no errors, but a development build would remove the
  mismatch.
- In CI, the full `npm run verify` (typecheck + Jest) runs on Linux only; the Windows CI job covers `scripts/` only.
  The full suite has passed natively on Windows only in local runs (above), so a Windows regression in typecheck or
  Jest would not fail CI.

## Follow-up tasks

These come from Milestone 1's and Milestone 2's reviews and device checks, and are tracked in `TASKS.md`. None blocks a
merged milestone.

| Item | Task | State | Next |
|---|---|---|---|
| Home and History content start under the translucent iOS title bar (owner, 2026-10-30) | **RO-028** | `todo`, P2 (code) | Claude Code; then the owner's device check |
| Boundary-checker hardening: per-adapter infrastructure layers, index-only `application/` imports (RO-011 finding 2) | **RO-025** | `todo` | Claude Code, before RO-029's BLE adapter (the second infrastructure adapter) |
| Ownership table in `docs/architecture.md` §6, and the `apps/mobile/AGENTS.md` routes note (RO-011 finding 4) | RO-008 | `todo` (docs) | Claude Code, once prioritised |
| Record the `apps/` + `packages/` layout in source of truth §6? | RO-010 | `todo` | Owner decision (ChatGPT prepares) |
| Brand configuration for display names (ADR 0006 follow-up; RO-011 finding 5) | **RO-024** | `todo`, P2 (code) | Claude Code, once prioritised |
| Where simulation lives: root barrel vs a `./simulation` subpath (RO-011 §3.2) | **RO-026** | `todo`, P3; unblocked now that RO-012 has merged | Gemini proposes, owner decides |
| Brand-neutral H0 stream header (RO-011 finding 5; ADR 0006 §3) | RO-016 scope note | `todo` (with RO-016) | RO-029's protocol proposal overlaps RO-016; owner or ChatGPT to re-scope RO-016 |

## Open branches / PRs (not merged — not counted as done)

Assessed 2026-10-31 against `main` @ `f1df6b2`. The merge states are GitHub's.

| PR / branch | What it contributes | Still needed? | Recommended action |
|---|---|---|---|
| [PR #22](https://github.com/bransondang3307-beep/RepOne/pull/22) (`claude/RO-025-dependency-security` @ `4027f14`, opened 2026-10-29 from another session) | The same Expo SDK 57 dependency patch as PR #21 | **No.** Superseded by PR #21 (merged `4d6ce0c`). Its task ID also collides with RO-025, boundary-checker hardening | Owner closes it unmerged as superseded |
| `claude/RO-012-integration-candidate` @ `fe41d47` (no PR) | The candidate the owner tested on 2026-10-30: PR #17's head plus PR #21's head | No. `main` now has the same code | Owner deletes it (cloud sessions cannot delete branches) |
| `claude/RO-019-claude-codex-loop` @ `af8acd9` | Archive of the original API loop (PR #4, closed unmerged) | Kept on purpose (ADR 0005 §6) | Owner: archive tag (see Next steps) |
| `claude/EXP-001-autofix-experiment` @ `9629bab` | [PR #18](https://github.com/bransondang3307-beep/RepOne/pull/18), the owner-authorised Auto-fix trigger experiment (2026-10-23), **closed unmerged**. Auto-fix is off again; workflow §10 is unchanged | Kept as evidence (owner, 2026-10-23) | None |
| `claude/RO-004-owner-decision` @ `15740e4` | [PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2), closed unmerged as superseded by PR #19 | Kept as history | None |
| `claude/RO-022-preview-{40d4a22,30e2dd3,6f48f1d,ro019}` | Temporary RO-022 CI previews | No | Owner deletes; harmless meanwhile |
| Branches of merged or closed PRs: `sprint-1-alignment`, `claude/RO-004-agent-sync`, `claude/RO-019-pause`, `claude/RO-019-zero-cost-workflow`, `claude/RO-022-windows-ci`, `claude/RO-019-RO-022-status-done`, `claude/RO-003-m1-closeout`, `claude/RO-004-status-ownership`, `claude/RO-021-windows-path-repro`, `gemini/RO-011-milestone-1-arch-review`, `claude/RO-020-rebrandable-naming`, `codex/RO-004-antigravity-onboarding`, `claude/RO-003-RO-004-status`, `claude/RO-027-dependency-security`, `claude/RO-012-sensor-error-states`, `claude/RO-012-channel-rep-engine`, `claude/RO-012-device-connection`, `claude/RO-012-app-device` | Nothing beyond what merged (PR #5, from `claude/RO-019-pause`, closed unmerged) | No | Owner may delete them; harmless meanwhile |

New PRs for RO-028, RO-025 and RO-029 are listed here by their own status updates once they merge; until then they
are open work, not done.

## Active milestone

- **Milestone 1 (RO-003) is closed out** (merged `cd884fc`; closeout PRs #13, #19, #9, #8, #6, #7 and #20).
- **Milestone 2 (RO-012) is done.**
  - Merged on 2026-10-31 as PRs #14 → #17 (`9a42cf0` · `9b93b32` · `058bfe4` · `f1df6b2`).
  - The owner's iPhone check passed on 2026-10-30, and ADR 0007 is Accepted.
  - RO-023 (the badge fix) and RO-027 (the dependency patch) are done with it.
- **Owner priority now: RO-029, the real-sensor BLE pipeline** (owner direction, 2026-10-31).
  - Protocol and codec, firmware, then the iPhone BLE adapter. RO-025 lands before the adapter.
  - Reviewable PRs only; the owner merges.
  - Hardware and iPhone validation stay outstanding until the owner performs them.
- **Milestones 3–5 (RO-013…RO-015)** follow later, each after the previous one merges and the owner approves.
  - RO-013 has a written plan, [`docs/plans/RO-013-milestone-3-plan.md`](docs/plans/RO-013-milestone-3-plan.md), with
    six owner decisions open.

## Blockers

| Blocker | Blocks | Owner |
|---|---|---|
| No real sensor data yet; the GY-521 / MPU-6050 is not physically verified (RO-018) | Any accuracy claim; detector tuning; physical validation of RO-029 | Owner (hardware) |
| No wireless board selected; the Uno R3 has no Bluetooth | A physical BLE link for RO-029 | Owner decision (RO-029 lists the required capabilities) |
| A BLE app needs a development build. Installing one on an iPhone needs a paid Apple Developer account (EAS cloud build), or a Mac for a free local build | Running RO-029's BLE adapter on the iPhone | Owner decision (cost) |
| Device runs need the owner's phone; cloud sessions cannot run them | Device acceptance (RO-028, RO-029) | Owner |
| Branch protection unavailable (private repo on GitHub Free). "PR + review before merge" is a process rule, not enforced | Workflow enforcement | Owner (optional: GitHub Pro or public repo) |

## Next steps (priority order — details in `TASKS.md`)

1. **RO-029, the owner's priority:** Claude Code opens reviewable PRs in order:
   1. protocol, codec and fixtures;
   2. firmware;
   3. RO-025 (boundary hardening);
   4. the BLE adapter with native configuration and a minimal UI.
2. **RO-028:** a small PR fixing the iOS title-bar overlap; the owner's device check, then the owner merges.
3. **ChatGPT / owner:** prioritise and assign the rest:
   - RO-013's six decisions (plan document);
   - RO-016 re-scoped against RO-029's protocol proposal;
   - RO-008, RO-024 and RO-010;
   - RO-026 (now unblocked).
4. **Owner:** manual items this environment cannot do:
   - close [PR #22](https://github.com/bransondang3307-beep/RepOne/pull/22) as superseded by PR #21;
   - delete `claude/RO-012-integration-candidate`, the four `claude/RO-022-preview-*` branches and, optionally, the
     merged branches listed above;
   - create the archive tag `archive/RO-019-api-loop-v1` on `af8acd9` (ADR 0005 §6);
   - keep the account $0 settings: GitHub Actions budget $0; no Codex credits or Claude extra usage (ADR 0005).

## Known limitations (carried forward)

- Detector thresholds are unvalidated hypotheses; rotational machines only; drift with uncorrected bias.
- Expo's online API is blocked in cloud sessions, so dependencies were installed with SDK-matched offline versions;
  `expo-doctor` and `expo lint` have not been run.
- No project license chosen (RO-009). No ESLint config (RO-017).
- The workflow policy's AI-SDK and endpoint denylists are defense in depth and cannot be complete. The $0 guarantee
  rests on having no AI credentials and no paid usage (ADR 0005).
- `actions/checkout@v4` and `actions/setup-node@v4` trigger GitHub's "Node.js 20 is deprecated" warning; upgrading
  them is a separate change.

## Status change log

| Date | Change | By |
|---|---|---|
| 2026-10-15 | File created; reflects `main` @ `d9a7274` | Claude Code (RO-004) |
| 2026-10-22 | Reflects `main` @ `8a70565`: PRs #1, #3, #11 and #10 merged; RO-019 and RO-022 done; Milestone 2 (RO-012) paused | Claude Code (RO-019 / RO-022 status) |
| 2026-10-23 | Milestone 1 closeout on `main` @ `9b8b81a`: RO-003…RO-007 done; RO-023 recorded; remaining Milestone 1 work and the open-PR assessment added; Milestone 2 (RO-012) still paused | Claude Code (Milestone 1 closeout, at the owner's request) |
| 2026-10-28 | Status-update rule (owner decision of 2026-10-28) and ADR 0004 → Accepted, in PR #19, which supersedes PR #2; PR #2's assessment corrected. Only the rule text and these rows changed: the snapshot at the top still describes `main` @ `9b8b81a` | Claude Code (RO-004 follow-up, at the owner's direction) |
| 2026-10-28 | Reflects `main` @ `b1c6ac1`, the Milestone 1 closeout batch: PRs #13, #19, #9, #8, #6 and #7 merged with CI green on `main` after each; PR #2 closed as superseded. RO-011, RO-020 and RO-021 done; follow-up tasks RO-024…RO-026 and an RO-016 scope note recorded. Snapshot, evidence, follow-up tasks, open-PR list, milestone, blockers and next steps refreshed. Milestone 2 (RO-012) still paused | Claude Code (its own work, plus RO-011 under the owner-directed closeout exception) |
| 2026-10-28 | Added Antigravity's native Windows verification of `b1c6ac1` (PR #7's merge), with Claude Code's independent re-run on the same laptop. The owner lifted the Milestone 2 pause; RO-012 is first in next steps, with a native Windows check of #17's head. No merges or task-state changes | Claude Code (owner's ecosystem update, 2026-10-28) |
| 2026-10-29 | The owner confirmed the Milestone 2 pause-lift directly. Remaining "paused" statements reconciled: the handoff's batch-time wording and the `TASKS.md` RO-023 status (Codex P2 on PR #20). No task-state changes | Claude Code (PR #20 fix) |
| 2026-10-31 | Reflects `main` @ `f1df6b2`, the Milestone 2 closeout: PRs #21 and #14–#17 merged after the owner's iPhone check of candidate `fe41d47` (2026-10-30), with CI green on `main` after each. RO-012, RO-023 and RO-027 done; ADR 0007 Accepted. RO-028 (title-bar overlap) and RO-029 (BLE pipeline, owner priority) recorded; RO-013 plan added; duplicate PR #22 flagged | Claude Code (its own work, plus the owner's device check, under the owner-directed exception) |
