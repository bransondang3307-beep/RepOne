# RepOne — Project Status

> **Rule:** "Verified on `main`" lists only work that is **merged into `main` and verified**, with the
> evidence. Unmerged work goes under "Open branches / PRs". Update this file in a PR only after the
> change it describes has merged. By default the agent that completed the work does so; Claude Code may also
> record the owner's device checks, Codex review tasks and owner-directed closeouts (`AGENTS.md` §3 step 9).
> Status words: see `AGENTS.md` §4.

| | |
|---|---|
| **Last updated** | 2026-10-28 by Claude Code (status update for its own work: PR #13 and PR #19 merged, PR #2 closed as superseded) |
| **`main` at** | `2959751` — "Merge PR #19: RO-004 status-update ownership; ADR 0004 Accepted (docs only)" |
| **CI on `main`** | GitHub Actions `CI` on every push and PR: Linux `verify` (boundaries, workflow policy, typecheck, tests) and a Windows job (boundary checker + script tests); handoff check on PRs. Last run on `main`: [40762889708](https://github.com/bransondang3307-beep/RepOne/actions/runs/40762889708) on `2959751` — Linux ✅, Windows ✅ (the handoff check runs on PRs only) |
| **Current phase** | Sprint 1. **Milestone 1 closed out:** merged, reviewed and device-checked (RO-003…RO-007 `done`); its follow-ups are listed below. The RO-004 follow-up (status-update ownership, ADR 0004 Accepted) is merged. **Milestone 2 (RO-012) is paused, with its work open:** four stacked PRs (#14–#17), none merged; it resumes only on the owner's go-ahead. Sprint 2 **not started**. |
| **Hardware** | No real sensor connected to the software yet (source of truth §2). All rep data is simulated. |
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

`TASKS.md` marks RO-003…RO-007, RO-019 and RO-022 `done`, with the evidence under each task.
- **RO-006** (assigned to Codex) and **RO-007** (assigned to the owner) were reconciled by Claude Code at the owner's
  request (2026-10-23), from the reviews and the device result recorded on PR #3. Under the rule merged with PR #19,
  such updates are an allowed exception (`AGENTS.md` §3 step 9).
- **Reviews of the two new merges.** Codex found no major issues on PR #13's final head `8cfeb0d`. On PR #19 it found
  one P2 at `2cca7bd`, fixed in `31908a2`, and then no major issues on `31908a2`. The owner authorised merging that
  exact commit.
- **[PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2) closed unmerged** on 2026-10-28 as superseded by PR #19, after CI passed on `main`
  ([closing comment](https://github.com/bransondang3307-beep/RepOne/pull/2#issuecomment-6479887030)). Its branch is kept as history.

## Verified on `main`

Evidence:
- **This session, 2026-10-28.** Worktree of `main` @ `2959751` with this PR's docs-only changes, Node 22.22.0,
  `npm ci`, then `npm run verify` (exit 0):
  - Module boundaries OK (58 files, no circular imports).
  - Workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files).
  - Typecheck OK.
  - Script tests **62/62**.
  - Jest **48/48**: `@repone/mobile` 15, `@repone/rep-engine` 16, `@repone/sensor-contracts` 13, `@repone/workout-domain` 4.
- **Milestone 1 at its merge commit `cd884fc`,** re-run on 2026-10-23: `npm run verify` exit 0. Boundaries OK, checker
  tests 8/8, typecheck OK, Jest 48/48.
- **CI.** Run 40762889708 on `2959751` passed on both Linux (Node 22) and Windows (Node 24). So did run 40740559028
  on `ad7e047` (PR #13's merge).
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
| Seeded synthetic motion; simulated and replay sources | `packages/sensor-contracts/src/simulation/` | `simulation.test.ts`, `sensorSources.test.ts` — **synthetic data only** |
| Rotational rep detector (FSM), full/partial classification, calibration, rep evaluation | `packages/rep-engine/src/` | `rotationalRepDetector`, `calibration`, `evaluateReps` tests — **synthetic data only** |
| Workout session and repository ports; in-memory repositories with a contract suite | `packages/workout-domain/src/` | `inMemoryRepositories.test.ts` |
| SQLite persistence (expo-sqlite adapter, migrations) | `apps/mobile/src/infrastructure/database/` | `sqliteRepositories`, `WorkoutSessionController.sqlite` tests (`node:sqlite`); iPhone via RO-007 |
| Application services (`WorkoutSessionController`, composition root) | `apps/mobile/src/application/` | `WorkoutSessionController.test.ts` |
| Mobile UI: simulated active set and history (expo-router), live-session store, provenance badge | `apps/mobile/app/`, `src/features/`, `src/shared/` | `liveSessionStore.test.ts`; typecheck; iPhone via RO-007 (badge clipping: RO-023) |
| Module boundary checker | `scripts/check-boundaries.mjs` | `check-boundaries.test.mjs`; CI on Linux and Windows |
| Workflow policy check: no AI API integrations, least-privilege permissions (RO-019) | `scripts/check-workflow-policy.mjs`, `.github/workflow-policy.json` | `check-workflow-policy.test.mjs`; CI "Workflow policy" step |
| CI: Linux verify, Windows script checks (RO-022), handoff check | `.github/workflows/ci.yml` | Runs listed above |
| Agent workflow: shared rules, task board, handoffs, PR template, Claude Code ↔ Codex review hand-off, status-update ownership (owner decision of 2026-10-28) | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/agents/`, `TASKS.md`, `docs/handoffs/`, `docs/automation/` | Docs; Codex reviews ran on PRs #3, #10, #11, #12, #13 and #19 |
| Architecture, hardware protocol, ADRs 0001–0005 (ADR 0004 Accepted, Decision 4 amended 2026-10-28) | `docs/architecture.md`, `docs/hardware-protocol.md`, `docs/decisions/` | Docs |

**Implemented but not verified:**
- No Android device run is recorded. Only `expo export` bundles were built, in RO-005.
- The full `npm run verify` (typecheck + Jest) runs on Linux only. The Windows CI job covers `scripts/` only.

## Remaining Milestone 1 work

Milestone 1's code is merged and accepted. None of these follow-ups blocks it, but they should be settled before
Milestone 2 resumes.

| Item | Task / PR | State | Next |
|---|---|---|---|
| Architecture review of Milestone 1 (Gemini) | RO-011 — [PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8) | Open, unreviewed. Written against `40d4a22`. Finding 1 (Windows paths) was fixed by RO-021 in `cd884fc`; findings 2–5 are recommendations not yet turned into tasks | Review and merge; ChatGPT/owner triage findings 2–5 (several feed RO-012) |
| Record of the Windows path fix | RO-021 — [PR #9](https://github.com/bransondang3307-beep/RepOne/pull/9) | The fix is merged (`cd884fc`); the task row and handoff are not on `main`; `TASKS.md` conflicts (still on `2959751`) | Claude Code refreshes it on `main` and marks RO-021 `done` |
| Ownership table in `docs/architecture.md` §6 | RO-008 | `todo`; its dependency (RO-003 merged) is met | Claude Code (docs) |
| Record the `apps/` + `packages/` layout in source of truth §6? | RO-010 | `todo`; its dependency is met | Owner decision (ChatGPT prepares) |
| Simulated-data warning badge clips on iPhone | **RO-023** (recorded 2026-10-23) | `todo`. The fix is in [PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17) (separate `RO-023:` commits, at the owner's request), which is part of the paused RO-012 stack and not merged | Merges with PR #17; owner's device check |

## Open branches / PRs (not merged — not counted as done)

Assessed 2026-10-28 against `main` @ `2959751`. The merge states are GitHub's. PRs #6–#9 have no Codex or owner
review yet; they were opened on 2026-10-15 or 2026-10-16 and were not modified.

| PR / branch | What it contributes | Still needed? | Recommended action |
|---|---|---|---|
| [PR #6](https://github.com/bransondang3307-beep/RepOne/pull/6) `claude/RO-020-rebrandable-naming` (Claude Code) | `AGENTS.md` §5 rebrandable-naming rule and ADR 0006 (owner directive 2026-10-16): name inventory, brand-config plan, neutral protocol and device identifiers | **Yes.** Nothing on `main` covers it. Its inventory still matches `main` (2 user-facing strings: `app.json` name and the home title in `app/_layout.tsx`). It merges cleanly. RO-020 has no `TASKS.md` row yet, and the deferred brand-config code is now unblocked | `@codex review`, then owner merge; add the RO-020 row and a code task for the brand config before Milestone 2 adds UI text |
| [PR #7](https://github.com/bransondang3307-beep/RepOne/pull/7) `codex/RO-004-antigravity-onboarding` (Codex) | Antigravity entry point and Lenovo Windows onboarding (4 docs) | **Yes, if Antigravity stays in use** (PR #8 was written there). It is stale: it describes `main` @ `75e2814` (RO-019 "paused", RO-007 pending on `sprint-1-alignment`, `verify` absent). It does not mention the $0 rule, `check:workflows` or the Codex review hand-off, and it adds nothing that conflicts with them | Codex refreshes it against `main`, then review and merge. Not urgent |
| [PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8) `gemini/RO-011-milestone-1-arch-review` (Gemini) | RO-011's deliverable: the Milestone 1 architecture review (0 blockers) and its handoff | **Yes.** It is RO-011's only output. It is a dated review of `40d4a22`, so the pre-merge wording is acceptable as history. It adds new files only | Owner or `@codex review`; merge as a dated record; then RO-011's status update and triage of findings 2–5 |
| [PR #9](https://github.com/bransondang3307-beep/RepOne/pull/9) `claude/RO-021-windows-path-repro` (Claude Code) | RO-021's task row, details and native-Windows evidence handoff. The code fix merged with PR #3; the permanent Windows CI came from RO-022 | **Yes, as the record** (not superseded), but stale. `TASKS.md` still conflicts with `main` @ `2959751`, it would leave RO-021 `in-review` although the fix merged, and its Windows-CI question was answered by RO-022 | Claude Code refreshes it on `main` (resolve `TASKS.md`, mark RO-021 `done` citing `cd884fc`); Codex review; owner merge |
| [PR #14](https://github.com/bransondang3307-beep/RepOne/pull/14) → [PR #15](https://github.com/bransondang3307-beep/RepOne/pull/15) → [PR #16](https://github.com/bransondang3307-beep/RepOne/pull/16) → [PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17) (Claude Code, stacked) | **RO-012, Milestone 2**, resumed by the owner on 2026-10-23: sensor error states (ADR 0007, Proposed), per-channel rep engine, `DeviceConnection` and `SimulatedDevice`, and app integration. PR #17 also has the RO-023 badge fix. Heads: `eb4e8de` · `1132dc3` · `605e12c` · `3de7aa3` | **Yes.** Codex found no major issues on each head (#16 after four fix rounds, rounds 3 and 4 owner-approved), and CI passed on each head. #14 targets `main` and merges cleanly with `2959751`; #15–#17 target the branch below them. **Paused by the owner (2026-10-28):** no merges or further RO-012 work until the owner's go-ahead. The owner's Expo Go check of #17's head is not reported yet | When the owner resumes Milestone 2: merge in order #14 → #15 → #16 → #17, retargeting each to `main` as the one below merges |
| `claude/RO-019-claude-codex-loop` @ `af8acd9` | Archive of the original API loop (PR #4, closed unmerged) | Kept on purpose (ADR 0005 §6) | Owner: archive tag (see Next steps) |
| `claude/EXP-001-autofix-experiment` @ `9629bab` | [PR #18](https://github.com/bransondang3307-beep/RepOne/pull/18), the owner-authorised Auto-fix trigger experiment (2026-10-23), **closed unmerged**. Result: a Codex review comment on its own woke the Auto-fix-subscribed Claude Code session, which fixed the finding. Auto-fix is off again; workflow §10 is unchanged | Kept as evidence (owner, 2026-10-23), with its handoff on the branch | None |
| `claude/RO-004-owner-decision` @ `15740e4` | [PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2), closed unmerged as superseded by PR #19 | Kept as history | None |
| `claude/RO-022-preview-{40d4a22,30e2dd3,6f48f1d,ro019}` | Temporary RO-022 CI previews | No | Owner deletes; harmless meanwhile |
| Branches of merged or closed PRs: `sprint-1-alignment`, `claude/RO-004-agent-sync`, `claude/RO-019-pause`, `claude/RO-019-zero-cost-workflow`, `claude/RO-022-windows-ci`, `claude/RO-019-RO-022-status-done`, `claude/RO-003-m1-closeout`, `claude/RO-004-status-ownership` | Nothing beyond what merged (PR #5, from `claude/RO-019-pause`, closed unmerged) | No | Owner may delete them; harmless meanwhile |

**Recommended order:**
1. **PR #9.** Refresh it and mark RO-021 `done`. It is small, and it is Claude Code's.
2. **PR #8.** Merge the review, then triage its findings 2–5.
3. **PR #6.** Merge the naming rule before Milestone 2's user-facing text merges.
4. **PR #7.** Codex refreshes it. It is independent and the least urgent.
5. **RO-012 stack (#14 → #17)** only when the owner resumes Milestone 2.

## Active milestone

- **Milestone 1 (RO-003) is closed out.**
  - Merged as `cd884fc` (RO-005).
  - Codex approved it (RO-006).
  - The owner's Expo Go check passed (RO-007).
  - The closeout record merged with PR #13 (`ad7e047`). Follow-ups are under "Remaining Milestone 1 work".
- **RO-019** and **RO-022** are **done**. They are process and CI improvements made between Milestones 1 and 2.
- **RO-004 follow-up merged** with PR #19 (`2959751`): status-update ownership and ADR 0004 Accepted.
- **Milestone 2 (RO-012): paused, with its work open.**
  - The owner resumed it on 2026-10-23. It was delivered in four stacked PRs, #14–#17 (see "Open branches / PRs").
  - None is merged, so none of it counts as done.
  - On 2026-10-28 the owner asked to keep it paused: no merges or further RO-012 work until the owner's go-ahead.
  - Milestones 3–5 (RO-013…RO-015) follow in order, each after the previous one merges.

## Blockers

| Blocker | Blocks | Owner |
|---|---|---|
| Owner go-ahead to resume Milestone 2 | Merging RO-012 (PRs #14–#17), then RO-013…RO-015 | Owner |
| No real sensor data yet | Any accuracy claim; detector tuning | Owner (hardware, RO-018, source of truth §11) |
| Device runs (Expo Go) need the owner's phone; cloud sessions cannot run them | Device acceptance for each milestone, including PR #17's head (RO-012 and RO-023) | Owner |
| Branch protection unavailable (private repo on GitHub Free). "PR + review before merge" is a process rule, not enforced | Workflow enforcement | Owner (optional: GitHub Pro or public repo) |

## Next steps (priority order — details in `TASKS.md`)

1. **Open PRs,** in the recommended order above, starting with PR #9.
2. **Milestone 1 follow-ups:**
   - RO-008 (ownership table);
   - RO-010 (owner decision);
   - RO-023: its fix ships with PR #17.
   RO-016 (Gemini H0 serial-schema research) is also ready.
3. **Owner:** manual items this environment cannot do:
   - create the archive tag `archive/RO-019-api-loop-v1` on `af8acd9` (ADR 0005 §6);
   - delete the four `claude/RO-022-preview-*` branches, and optionally the merged and closed branches listed above;
   - keep the account $0 settings: GitHub Actions budget $0; no Codex credits or Claude extra usage (ADR 0005).
4. **RO-012 (Milestone 2)** when the owner resumes it: merge #14 → #17 in order, after the Expo Go check of #17's head.

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
| 2026-10-28 | Reflects `main` @ `2959751`: PRs #13 and #19 merged with CI green on `main`; PR #2 closed as superseded. Snapshot, evidence, remaining work, open-PR list (adds RO-012's PRs #14–#17 and the closed experiment PR #18), milestone, blockers and next steps refreshed. Milestone 2 (RO-012) still paused | Claude Code (RO-003 / RO-004 status update, its own work) |
