# RepOne — Project Status

> **Rule:** "Verified on `main`" lists only work that is **merged into `main` and verified**, with the
> evidence. Unmerged work goes under "Open branches / PRs". Update this file in a PR only after the
> change it describes has merged (`AGENTS.md` §3 step 9). Status words: see `AGENTS.md` §4.

| | |
|---|---|
| **Last updated** | 2026-10-22 by Claude Code (RO-019 / RO-022 status follow-up) |
| **`main` at** | `8a70565` — "Merge PR #10: RO-022 Windows CI job for the boundary checker" |
| **CI on `main`** | GitHub Actions `CI` on every push and PR: Linux `verify` (boundaries, workflow policy, typecheck, tests) and a Windows job (boundary checker + script tests); handoff check on PRs. Last run on `main`: [39701367400](https://github.com/bransondang3307-beep/RepOne/actions/runs/39701367400) on `8a70565` — Linux ✅, Windows ✅ |
| **Current phase** | Sprint 1. Milestone 1 merged. **Milestone 2 (RO-012) is paused** until the owner resumes it. Sprint 2 **not started**. |
| **Hardware** | No real sensor connected to the software yet (source of truth §2). All rep data is simulated. |
| **AI cost** | **$0 additional AI API spending** (owner rule, ADR 0005): subscriptions only, no AI API keys or paid AI services; enforced in CI by `npm run check:workflows` |

## Merged into `main`

| Date (UTC) | PR | Merge commit | Task(s) | CI on `main` after the merge |
|---|---|---|---|---|
| 2026-10-15 | [PR #1](https://github.com/bransondang3307-beep/RepOne/pull/1) | `75e2814` | RO-004 multi-agent sync setup | [38807737485](https://github.com/bransondang3307-beep/RepOne/actions/runs/38807737485) ✅ |
| 2026-10-17 | [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3) | `cd884fc` | RO-003 / RO-005 Milestone 1 module layout | [38986550607](https://github.com/bransondang3307-beep/RepOne/actions/runs/38986550607) ✅ |
| 2026-10-21 | [PR #11](https://github.com/bransondang3307-beep/RepOne/pull/11) | `acb9857` | **RO-019** Claude Code ↔ Codex workflow at $0 additional AI API cost — **done** | [39522348555](https://github.com/bransondang3307-beep/RepOne/actions/runs/39522348555) ✅ |
| 2026-10-22 | [PR #10](https://github.com/bransondang3307-beep/RepOne/pull/10) | `8a70565` | **RO-022** Windows CI job for the boundary checker — **done** | [39701367400](https://github.com/bransondang3307-beep/RepOne/actions/runs/39701367400) ✅ |

`TASKS.md` marks RO-019 and RO-022 `done`. The rows for RO-003, RO-004 and RO-005, and Milestone 1's review and device
check (RO-006, RO-007), have **not** been updated yet. That is outside this follow-up; see Next steps.

## Verified on `main`

Evidence:
- **This session, 2026-10-22.** Fresh worktree of `main` @ `8a70565`, Node 22.22.0, `npm ci`, then `npm run verify`
  (exit 0):
  - Module boundaries OK (58 files, no circular imports).
  - Workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files).
  - Typecheck OK.
  - Script tests **62/62**.
  - Jest **48/48**: `@repone/mobile` 15, `@repone/rep-engine` 16, `@repone/sensor-contracts` 13, `@repone/workout-domain` 4.
- **CI.** Run 39701367400 on `8a70565` passed on both Linux (Node 22) and Windows (Node 24).
- **Device: RO-007, 2026-10-16.** The owner ran Expo Go on an iPhone against `sprint-1-alignment` @ `6f48f1d`, PR #3's
  merged head ([comment](https://github.com/bransondang3307-beep/RepOne/pull/3#issuecomment-6227338609)):
  - The app launched and counted simulated reps.
  - Stopping a set saved it, and the set appeared in History.
  - It was still in History after the app was restarted.
  - This validates the **simulated** workflow and on-device persistence, **not** physical sensor performance or
    real rep-detection accuracy.

| Feature | Location on `main` | Verified by |
|---|---|---|
| Sensor contracts (`SensorSource`, samples, derived data) with a shared contract test suite | `packages/sensor-contracts/src/` (`testing/` for the suite) | `sensorSources.test.ts` |
| Seeded synthetic motion; simulated and replay sources | `packages/sensor-contracts/src/simulation/` | `simulation.test.ts`, `sensorSources.test.ts` — **synthetic data only** |
| Rotational rep detector (FSM), full/partial classification, calibration, rep evaluation | `packages/rep-engine/src/` | `rotationalRepDetector`, `calibration`, `evaluateReps` tests — **synthetic data only** |
| Workout session and repository ports; in-memory repositories with a contract suite | `packages/workout-domain/src/` | `inMemoryRepositories.test.ts` |
| SQLite persistence (expo-sqlite adapter, migrations) | `apps/mobile/src/infrastructure/database/` | `sqliteRepositories`, `WorkoutSessionController.sqlite` tests (`node:sqlite`); iPhone via RO-007 |
| Application services (`WorkoutSessionController`, composition root) | `apps/mobile/src/application/` | `WorkoutSessionController.test.ts` |
| Mobile UI: simulated active set and history (expo-router), live-session store, provenance badge | `apps/mobile/app/`, `src/features/`, `src/shared/` | `liveSessionStore.test.ts`; typecheck; iPhone via RO-007 |
| Module boundary checker | `scripts/check-boundaries.mjs` | `check-boundaries.test.mjs`; CI on Linux and Windows |
| Workflow policy check: no AI API integrations, least-privilege permissions (RO-019) | `scripts/check-workflow-policy.mjs`, `.github/workflow-policy.json` | `check-workflow-policy.test.mjs`; CI "Workflow policy" step |
| CI: Linux verify, Windows script checks (RO-022), handoff check | `.github/workflows/ci.yml` | Runs listed above |
| Agent workflow: shared rules, task board, handoffs, PR template, Claude Code ↔ Codex review hand-off | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/agents/`, `TASKS.md`, `docs/handoffs/`, `docs/automation/` | Docs; Codex reviews ran on PRs #3, #10 and #11 |
| Architecture, hardware protocol, ADRs 0001–0005 | `docs/architecture.md`, `docs/hardware-protocol.md`, `docs/decisions/` | Docs |

**Implemented but not verified:**
- No Android device run is recorded. Only `expo export` bundles were built, in RO-005.
- The full `npm run verify` (typecheck + Jest) runs on Linux only. The Windows CI job covers `scripts/` only.

## Open branches / PRs (not merged — not counted as done)

| PR / branch | Task | State |
|---|---|---|
| [PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2) `claude/RO-004-owner-decision` | RO-004 follow-up: status-update PRs per agent | Open. Touches `TASKS.md` and `PROJECT_STATUS.md`, so it will likely conflict once this PR merges |
| [PR #6](https://github.com/bransondang3307-beep/RepOne/pull/6) `claude/RO-020-rebrandable-naming` | RO-020: rebrandable naming rule + ADR 0006 (docs) | Open |
| [PR #7](https://github.com/bransondang3307-beep/RepOne/pull/7) `codex/RO-004-antigravity-onboarding` | RO-004: Antigravity onboarding for Lenovo Windows (Codex) | Open |
| [PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8) `gemini/RO-011-milestone-1-arch-review` | RO-011: Milestone 1 architecture review (Gemini) | Open |
| [PR #9](https://github.com/bransondang3307-beep/RepOne/pull/9) `claude/RO-021-windows-path-repro` | RO-021: Windows path repro record (docs; the fix merged with PR #3) | Open. `TASKS.md` conflicts with `main` |
| `claude/RO-019-claude-codex-loop` @ `af8acd9` | Archive of the original API loop (PR #4, closed unmerged) | Kept on purpose (ADR 0005 §6) |
| `claude/RO-022-preview-{40d4a22,30e2dd3,6f48f1d,ro019}` | Temporary RO-022 CI previews | To delete (owner); harmless meanwhile |

## Active milestone

- **Milestone 1** (RO-003) is merged (`cd884fc`). Codex reviewed PR #3's head `6f48f1d` with no major issues, and the
  owner's Expo Go check (RO-007) passed.
- **RO-019** and **RO-022** are **done**. Process and CI improvements made between Milestones 1 and 2.
- **Milestone 2 (RO-012): paused.** It is not started and has no branch. The owner put RO-019 first, and M2 resumes
  only on the owner's explicit go-ahead. Milestones 3–5 (RO-013…RO-015) follow in order, each after the previous one
  merges.

## Blockers

| Blocker | Blocks | Owner |
|---|---|---|
| Owner go-ahead to resume Milestone 2 | RO-012, then RO-013…RO-015 | Owner |
| No real sensor data yet | Any accuracy claim; detector tuning | Owner (hardware, RO-018, source of truth §11) |
| Device runs (Expo Go) need the owner's phone; cloud sessions cannot run them | Device acceptance for each milestone | Owner |
| Branch protection unavailable (private repo on GitHub Free). "PR + review before merge" is a process rule, not enforced | Workflow enforcement | Owner (optional: GitHub Pro or public repo) |

## Next steps (priority order — details in `TASKS.md`)

1. **Owner:** review and merge this status PR.
2. **Owner:** manual items this environment cannot do:
   - create the archive tag `archive/RO-019-api-loop-v1` on `af8acd9` (ADR 0005 §6);
   - delete the four `claude/RO-022-preview-*` branches;
   - keep the account $0 settings: GitHub Actions budget $0; no Codex credits or Claude extra usage (ADR 0005).
3. **Status follow-up for Milestone 1:** RO-003, RO-004 and RO-005 (Claude Code), RO-006 (Codex) and RO-007 (Owner)
   still show `in-review` / `todo` although PRs #1 and #3 merged and the evidence above exists. Each row's owner
   updates it, or the owner asks Claude Code to.
4. **Open PRs:** update PR #9 and PR #2 against `main` (`TASKS.md` / `PROJECT_STATUS.md` conflicts). Review PR #8
   (RO-011) and PR #6 (RO-020).
5. **Small fixes waiting for a task ID (next free: RO-023):** the yellow simulated-data warning clips at the screen
   edge on iPhone (seen in RO-007; non-blocking).
6. **Ready to start:** RO-008 (ownership table in `docs/architecture.md`; its dependency, RO-003 merged, is now met)
   and RO-016 (Gemini H0 serial-schema research).
7. **RO-012 (Milestone 2)** when the owner resumes it.

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
