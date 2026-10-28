# RepOne — Project Status

> **Rule:** "Verified on `main`" lists only work that is **merged into `main` and verified**, with the
> evidence. Unmerged work goes under "Open branches / PRs". Update this file in a PR only after the
> change it describes has merged. By default the agent that completed the work does so; Claude Code may also
> record the owner's device checks, Codex review tasks and owner-directed closeouts (`AGENTS.md` §3 step 9).
> Status words: see `AGENTS.md` §4.

| | |
|---|---|
| **Last updated** | 2026-10-28 by Claude Code: the Milestone 1 closeout batch, as directed by the owner (PRs #13, #19, #9, #8, #6 and #7 merged; PR #2 closed as superseded) |
| **`main` at** | `b1c6ac1` — "Merge PR #7: RO-004 Antigravity onboarding for the Lenovo Windows laptop (Codex; refreshed, docs only)" |
| **CI on `main`** | GitHub Actions `CI` on every push and PR: Linux `verify` (boundaries, workflow policy, typecheck, tests) and a Windows job (boundary checker + script tests); handoff check on PRs. Last run on `main`: [40768087759](https://github.com/bransondang3307-beep/RepOne/actions/runs/40768087759) on `b1c6ac1` — Linux ✅, Windows ✅ (the handoff check runs on PRs only) |
| **Current phase** | Sprint 1. **Milestone 1 is closed out,** including all its open follow-up PRs: merged, reviewed and device-checked (RO-003…RO-007), architecture-reviewed (RO-011), with the Windows fix recorded (RO-021) and the naming rule in place (RO-020). The remaining follow-up *tasks* are listed below. **Milestone 2 (RO-012) is paused, with its work open:** four stacked PRs (#14–#17), none merged; it resumes only on the owner's go-ahead. Sprint 2 **not started**. |
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
| 2026-10-28 | [PR #9](https://github.com/bransondang3307-beep/RepOne/pull/9) | `4951a37` | **RO-021** record: the Windows path fix (merged in `cd884fc`) marked done (docs) | [40765879014](https://github.com/bransondang3307-beep/RepOne/actions/runs/40765879014) ✅ |
| 2026-10-28 | [PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8) | `f41309c` | **RO-011** Milestone 1 architecture review (Gemini; a dated record of `40d4a22`) — **done** | [40767477040](https://github.com/bransondang3307-beep/RepOne/actions/runs/40767477040) ✅ |
| 2026-10-28 | [PR #6](https://github.com/bransondang3307-beep/RepOne/pull/6) | `81ccca6` | **RO-020** rebrandable naming rule (`AGENTS.md` §5) and ADR 0006 — **done**; RO-024 recorded | [40767822488](https://github.com/bransondang3307-beep/RepOne/actions/runs/40767822488) ✅ |
| 2026-10-28 | [PR #7](https://github.com/bransondang3307-beep/RepOne/pull/7) | `b1c6ac1` | RO-004 follow-up: Antigravity onboarding (Codex; refreshed by Claude Code at the owner's direction) | [40768087759](https://github.com/bransondang3307-beep/RepOne/actions/runs/40768087759) ✅ |

`TASKS.md` marks RO-003…RO-007, RO-011, RO-019, RO-020, RO-021 and RO-022 `done`, with the evidence under each task.
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
- **[PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2) closed unmerged** on 2026-10-28 as superseded by PR #19, after CI passed on `main`
  ([closing comment](https://github.com/bransondang3307-beep/RepOne/pull/2#issuecomment-6479887030)). Its branch is kept as history.

## Verified on `main`

Evidence:
- **This session, 2026-10-28.** Worktree of `main` @ `b1c6ac1` with this PR's docs-only changes, Node 22.22.0,
  `npm ci`, then `npm run verify` (exit 0):
  - Module boundaries OK (58 files, no circular imports).
  - Workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files).
  - Typecheck OK.
  - Script tests **62/62**.
  - Jest **48/48**: `@repone/mobile` 15, `@repone/rep-engine` 16, `@repone/sensor-contracts` 13, `@repone/workout-domain` 4.
- **Milestone 1 at its merge commit `cd884fc`,** re-run on 2026-10-23: `npm run verify` exit 0. Boundaries OK, checker
  tests 8/8, typecheck OK, Jest 48/48.
- **CI.** Run 40768087759 on `b1c6ac1` passed on both Linux (Node 22) and Windows (Node 24). So did every earlier
  `main` run of 2026-10-28 (see the table above).
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
| Agent workflow: shared rules, task board, handoffs, PR template, Claude Code ↔ Codex review hand-off, status-update ownership (owner decision of 2026-10-28), rebrandable naming rule (ADR 0006), Antigravity onboarding | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `ANTIGRAVITY.md`, `docs/agents/`, `TASKS.md`, `docs/handoffs/`, `docs/automation/` | Docs; Codex reviews ran on PRs #3, #6–#13 and #19 |
| Architecture, hardware protocol, ADRs 0001–0006 (ADR 0004 Accepted, Decision 4 amended 2026-10-28; ADR 0006 Accepted); Milestone 1 architecture review (RO-011, dated 2026-10-16) | `docs/architecture.md`, `docs/hardware-protocol.md`, `docs/decisions/`, `docs/research/` | Docs |

**Implemented but not verified:**
- No Android device run is recorded. Only `expo export` bundles were built, in RO-005.
- The full `npm run verify` (typecheck + Jest) runs on Linux only. The Windows CI job covers `scripts/` only.

## Milestone 1 follow-up tasks

Milestone 1 and all its follow-up PRs are merged. None of these tasks blocks Milestone 1. They come from its reviews
and the owner's device check, and are tracked in `TASKS.md`.

| Item | Task | State | Next |
|---|---|---|---|
| Ownership table in `docs/architecture.md` §6, and the `apps/mobile/AGENTS.md` routes note (RO-011 finding 4) | RO-008 | `todo` (docs) | Claude Code |
| Record the `apps/` + `packages/` layout in source of truth §6? | RO-010 | `todo` | Owner decision (ChatGPT prepares) |
| Simulated-data warning badge clips on iPhone | **RO-023** | `todo`. The fix is in [PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17) (separate `RO-023:` commits), part of the paused RO-012 stack | Merges with PR #17; owner's device check |
| Brand configuration for display names (ADR 0006 follow-up; RO-011 finding 5) | **RO-024** | `todo`, P2 (code) | Claude Code, once assigned |
| Boundary-checker hardening: per-adapter infrastructure layers, index-only `application/` imports (RO-011 finding 2) | **RO-025** | `todo`, P3 | Claude Code, before a second infrastructure adapter lands |
| Where simulation lives: root barrel vs a `./simulation` subpath (RO-011 §3.2) | **RO-026** | `todo`, P3 | Gemini proposes, owner decides; after RO-012 merges |
| Brand-neutral H0 stream header (RO-011 finding 5; ADR 0006 §3) | RO-016 scope note | `todo` (with RO-016) | Gemini, in the H0 serial-schema research |

## Open branches / PRs (not merged — not counted as done)

Assessed 2026-10-28 against `main` @ `b1c6ac1`. The merge states are GitHub's. Apart from status updates, the only open
PRs are RO-012's.

| PR / branch | What it contributes | Still needed? | Recommended action |
|---|---|---|---|
| [PR #14](https://github.com/bransondang3307-beep/RepOne/pull/14) → [PR #15](https://github.com/bransondang3307-beep/RepOne/pull/15) → [PR #16](https://github.com/bransondang3307-beep/RepOne/pull/16) → [PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17) (Claude Code, stacked) | **RO-012, Milestone 2**, resumed by the owner on 2026-10-23: sensor error states (ADR 0007, Proposed), per-channel rep engine, `DeviceConnection` and `SimulatedDevice`, and app integration. PR #17 also has the RO-023 badge fix. Heads: `eb4e8de` · `1132dc3` · `605e12c` · `3de7aa3` | **Yes.** Codex found no major issues on each head (#16 after four fix rounds, rounds 3 and 4 owner-approved), and CI passed on each head. #14 targets `main` and merges cleanly with `b1c6ac1`; #15–#17 target the branch below them. **Paused by the owner (2026-10-28):** no merges or further RO-012 work until the owner's go-ahead. The owner's Expo Go check of #17's head is not reported yet | When the owner resumes Milestone 2: merge in order #14 → #15 → #16 → #17, retargeting each to `main` as the one below merges |
| `claude/RO-019-claude-codex-loop` @ `af8acd9` | Archive of the original API loop (PR #4, closed unmerged) | Kept on purpose (ADR 0005 §6) | Owner: archive tag (see Next steps) |
| `claude/EXP-001-autofix-experiment` @ `9629bab` | [PR #18](https://github.com/bransondang3307-beep/RepOne/pull/18), the owner-authorised Auto-fix trigger experiment (2026-10-23), **closed unmerged**. Result: a Codex review comment on its own woke the Auto-fix-subscribed Claude Code session, which fixed the finding. Auto-fix is off again; workflow §10 is unchanged | Kept as evidence (owner, 2026-10-23), with its handoff on the branch | None |
| `claude/RO-004-owner-decision` @ `15740e4` | [PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2), closed unmerged as superseded by PR #19 | Kept as history | None |
| `claude/RO-022-preview-{40d4a22,30e2dd3,6f48f1d,ro019}` | Temporary RO-022 CI previews | No | Owner deletes; harmless meanwhile |
| Branches of merged or closed PRs: `sprint-1-alignment`, `claude/RO-004-agent-sync`, `claude/RO-019-pause`, `claude/RO-019-zero-cost-workflow`, `claude/RO-022-windows-ci`, `claude/RO-019-RO-022-status-done`, `claude/RO-003-m1-closeout`, `claude/RO-004-status-ownership`, `claude/RO-021-windows-path-repro`, `gemini/RO-011-milestone-1-arch-review`, `claude/RO-020-rebrandable-naming`, `codex/RO-004-antigravity-onboarding` | Nothing beyond what merged (PR #5, from `claude/RO-019-pause`, closed unmerged) | No | Owner may delete them; harmless meanwhile |

**Recommended order:** no other PR is open. The next work is task-based (below). The RO-012 stack (#14 → #17)
merges only when the owner resumes Milestone 2.

## Active milestone

- **Milestone 1 (RO-003) is closed out.**
  - Merged as `cd884fc` (RO-005); Codex approved it (RO-006); the owner's Expo Go check passed (RO-007).
  - Closeout record: PR #13 (`ad7e047`).
  - Follow-up PRs merged on 2026-10-28:
    - the RO-021 record (PR #9);
    - the RO-011 architecture review (PR #8);
    - the RO-020 naming rule (PR #6);
    - Antigravity onboarding (PR #7).
  - The remaining follow-ups are tasks (above).
- **RO-019** and **RO-022** are **done**. They are process and CI improvements made between Milestones 1 and 2.
- **RO-004 follow-ups merged:** status-update ownership and ADR 0004 Accepted (PR #19, `2959751`); Antigravity
  onboarding (PR #7, `b1c6ac1`).
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

1. **ChatGPT / owner:** prioritise and assign the follow-up tasks. Suggested:
   - RO-008 (Claude Code, docs);
   - RO-024 (Claude Code, code);
   - RO-010 (owner decision);
   - RO-025 and RO-026 at P3;
   - RO-016 (Gemini; including the header note) and RO-018 (owner hardware) are also ready.
2. **Owner:** manual items this environment cannot do:
   - create the archive tag `archive/RO-019-api-loop-v1` on `af8acd9` (ADR 0005 §6);
   - delete the four `claude/RO-022-preview-*` branches, and optionally the merged and closed branches listed above;
   - keep the account $0 settings: GitHub Actions budget $0; no Codex credits or Claude extra usage (ADR 0005).
3. **RO-012 (Milestone 2)** when the owner resumes it: merge #14 → #17 in order, after the Expo Go check of #17's head.

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
