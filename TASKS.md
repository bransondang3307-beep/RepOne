# RepOne — Tasks

> Shared task board for all agents. Rules (`AGENTS.md` §3–4):
> - Work only on tasks assigned to you; branch `<agent>/<TASK-ID>-<slug>`; commits start with the task ID.
> - Edit only your own task's row/section, except as `AGENTS.md` §3 step 9 allows. ChatGPT proposes new tasks and assignments; the owner, or an agent acting at the owner's direction, commits them.
> - After your work PR merges, set your row to `done` in your own status-update PR (`AGENTS.md` §3 step 9).
> - `done` = PR **merged into `main`** and completion criteria verified. Record the merge commit.
> - Status: `todo` · `in-progress` · `in-review` · `done` · `blocked`. Priority: **P1** (now) · **P2** (next) · **P3** (later).
> - Next free ID: **RO-027**.

## Board

| ID | Title | Owner | Pri | Status | Depends on | Branch / PR |
|---|---|---|---|---|---|---|
| RO-001 | Sprint 1 foundation (core + Expo app) | Claude Code | — | done | — | `main` @ `1b7e5b9` (pushed directly; pre-workflow) |
| RO-002 | Publish repository to private GitHub | Claude Code | — | done | RO-001 | `main` @ `d9a7274` |
| RO-003 | Milestone 1: align module layout with full Sprint 1 brief | Claude Code | P1 | done | — | [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3) — merged `cd884fc` |
| RO-004 | Multi-agent synchronization setup | Claude Code | P1 | done | — | [PR #1](https://github.com/bransondang3307-beep/RepOne/pull/1) — merged `75e2814` |
| RO-005 | Open PR for `sprint-1-alignment` → `main` | Claude Code | P1 | done | RO-004 | [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3) — merged `cd884fc` |
| RO-006 | Review Milestone 1 PR | Codex | P1 | done | RO-005 | Reviews on [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3) — approved `6f48f1d` |
| RO-007 | Run Milestone 1 app in Expo Go | Owner | P1 | done | — | [Result on PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3#issuecomment-6227338609) — passed (iPhone, simulated data) |
| RO-008 | Update `docs/architecture.md` §6 ownership to `AGENTS.md` roles; correct the routes location note | Claude Code | P2 | todo | RO-003 merged | — |
| RO-009 | Choose a project license | Owner | P3 | todo | — | — |
| RO-010 | Decide whether to record the app layout in source of truth §6 | Owner (ChatGPT prepares) | P3 | todo | RO-003 merged | — |
| RO-011 | Architecture review of Milestone 1 layout (ADR 0003) | Gemini | P2 | done | RO-005 | [PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8) — merged `f41309c` |
| RO-012 | Alignment Milestone 2: contracts, multi-channel engine wrapper, device connectivity | Claude Code | P2 | in-progress | RO-003 merged, owner go-ahead (both met 2026-10-23) | Part 1: [PR #14](https://github.com/bransondang3307-beep/RepOne/pull/14) · part 2: [PR #15](https://github.com/bransondang3307-beep/RepOne/pull/15) · part 3: [PR #16](https://github.com/bransondang3307-beep/RepOne/pull/16) · part 4: [PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17) |
| RO-013 | Alignment Milestone 3: workout domain + persistence | Claude Code | P2 | todo | RO-012 | — |
| RO-014 | Alignment Milestone 4: mobile UI | Claude Code | P2 | todo | RO-013 | — |
| RO-015 | Alignment Milestone 5: integration + Sprint 1 close-out | Claude Code + Codex | P2 | todo | RO-014 | — |
| RO-016 | Research: H0 serial packet schema and sample rate | Gemini | P2 | todo | — | — |
| RO-017 | Add ESLint config and lint step to CI | Codex | P3 | todo | RO-004 merged | — |
| RO-018 | H0 hardware bring-up: verify parts, I²C scan, stream raw IMU | Owner | P2 | todo | — | — |
| RO-019 | Claude Code ↔ Codex workflow at zero additional AI API cost (replaces the archived API loop, PR #4) | Claude Code | P1 | done | — | [PR #11](https://github.com/bransondang3307-beep/RepOne/pull/11) — merged `acb9857` |
| RO-020 | Rebrandable naming rule (`AGENTS.md` §5) and ADR 0006 | Claude Code | P2 | done | — | [PR #6](https://github.com/bransondang3307-beep/RepOne/pull/6) — merged `81ccca6` |
| RO-021 | Reproduce + fix RO-011 finding 1: Windows path separators in the boundary checker | Claude Code | P1 | done | RO-011 ([PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8)) | fix: [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3) — merged `cd884fc`; record: [PR #9](https://github.com/bransondang3307-beep/RepOne/pull/9) |
| RO-022 | Windows CI job for the boundary checker (Linux CI retained) | Claude Code | P2 | done | RO-021 | [PR #10](https://github.com/bransondang3307-beep/RepOne/pull/10) — merged `8a70565` |
| RO-023 | Simulated-data warning badge clips on iPhone (record only; not fixed yet) | Claude Code | P3 | todo | — | — |
| RO-024 | Brand configuration for display names (ADR 0006 follow-up) | Claude Code | P2 | todo | RO-020 merged | — |
| RO-025 | Boundary-checker hardening: per-adapter infrastructure layers; `application/` imports infrastructure only via its index (RO-011 finding 2) | Claude Code | P3 | todo | before a second `src/infrastructure/<adapter>` lands | — |
| RO-026 | Decide where simulation lives: root barrel vs a `./simulation` subpath export (RO-011 §3.2) | Gemini (proposal) → owner decides | P3 | todo | RO-012 merged | — |

## Task details

### RO-003 — Milestone 1: align module layout with the full Sprint 1 brief
- **Files:** whole repo layout (see `docs/decisions/0003-full-spec-module-layout.md` on the branch).
- **Description:** restructure only; no behaviour change. Already implemented on `sprint-1-alignment` @ `6e79ee3`.
- **Completion criteria:** PR merged; CI green; `npm run verify` passes (boundaries, typecheck, 46/46 tests);
  owner confirms the app runs in Expo Go (RO-007); Codex review approved (RO-006).
- **Done — merged 2026-10-17 (UTC) as `cd884fc`** ([PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3), head `6f48f1d`). Every criterion is met:
  - CI green: PR run [38933844181](https://github.com/bransondang3307-beep/RepOne/actions/runs/38933844181) on `6f48f1d`, and `main` run
    [38986550607](https://github.com/bransondang3307-beep/RepOne/actions/runs/38986550607) on `cd884fc`.
  - `npm run verify` at `cd884fc`, re-run 2026-10-23 (Node 22.22.0, after `npm ci`), exit 0:
    - boundaries OK (58 files);
    - checker tests 8/8;
    - typecheck OK;
    - Jest 48/48. That is 48 rather than 46 because the RO-006 fix `2dae11b` added SQLite integration tests.
  - Owner Expo Go check passed (RO-007) and Codex approved (RO-006); see below.

### RO-004 — Multi-agent synchronization setup
- **Files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/agents/CHATGPT.md`, `PROJECT_STATUS.md`, `TASKS.md`,
  `docs/handoffs/{README,TEMPLATE}.md`, `.github/pull_request_template.md`, `.github/workflows/ci.yml`, ADR 0004.
- **Description:** shared instructions, tracker, task board, handoff system, PR template and CI so all agents
  work from the same context. No code, test or algorithm changes.
- **Completion criteria:** PR merged; CI workflow runs green on `main`; `CLAUDE.md`/`GEMINI.md` load `AGENTS.md`.
- **Done — merged 2026-10-15 (UTC) as `75e2814`** ([PR #1](https://github.com/bransondang3307-beep/RepOne/pull/1)).
  - CI on `main` has been green since: run [38807737485](https://github.com/bransondang3307-beep/RepOne/actions/runs/38807737485) after the merge, and every later
    `main` run.
  - `CLAUDE.md` imports `@AGENTS.md`, and `GEMINI.md` imports `@./AGENTS.md`.
  - Follow-ups, not part of these criteria:
    - [PR #19](https://github.com/bransondang3307-beep/RepOne/pull/19): status-update ownership (owner decision of 2026-10-28) and ADR 0004 → Accepted.
      **Merged 2026-10-28 as `2959751`**; CI on `main` passed (run [40762889708](https://github.com/bransondang3307-beep/RepOne/actions/runs/40762889708)).
      It superseded [PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2), which was closed unmerged the same day.
    - [PR #7](https://github.com/bransondang3307-beep/RepOne/pull/7): Antigravity onboarding (Codex), refreshed by Claude Code at the owner's direction.
      **Merged 2026-10-28 as `b1c6ac1`** (head `a46e5d4`); CI on `main` passed (run [40768087759](https://github.com/bransondang3307-beep/RepOne/actions/runs/40768087759)).
      Antigravity then ran `npm.cmd ci` and `npm.cmd run verify` on `b1c6ac1` on the Lenovo laptop (Node v24.22.0,
      npm 11.19.1): exit 0, scripts 62/62, Jest 48/48. Claude Code reproduced the result on the same laptop.

### RO-005 — Open PR for `sprint-1-alignment`
- **Files:** none changed beyond merging `main` into the branch if needed (+ its handoff).
- **Completion criteria:** PR open against `main` using the PR template, CI result reported, handoff added.
- **Done.** [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3) was opened against `main` with the PR template's sections, and CI results were reported on it (run
  38933844181 for the final head). Its handoff, `docs/handoffs/2026-10-15-claude-RO-005.md`, is on `main`. Merged as `cd884fc`.

### RO-006 — Review Milestone 1 PR (Codex)
- **Files:** review only; fixes go on `codex/RO-006-…` branches or as PR suggestions.
- **Description:** check module boundaries vs `docs/architecture.md`, that no behaviour changed (same tests),
  contract suites, and the boundary checker's rules. Run `npm run verify` independently.
- **Completion criteria:** written review on the PR with the exact test output; blocking issues listed or approval given.
- **Done.** Codex wrote three reviews on [PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3), each with its own test output:
  - [Review 1](https://github.com/bransondang3307-beep/RepOne/pull/3#pullrequestreview-5540804748) on `1ef8f6f`: changes requested, two P2s (workspace-import
    cycles in the boundary checker; a lost controller × SQLite integration test). Both were fixed in `2dae11b`.
  - [Review 2](https://github.com/bransondang3307-beep/RepOne/pull/3#pullrequestreview-5541144246): **approved** `40d4a22`.
  - [Review 3](https://github.com/bransondang3307-beep/RepOne/pull/3#pullrequestreview-5551033324): **approved** the final head `6f48f1d` after the RO-021
    Windows fix, with native-Windows results.
  - They are COMMENT reviews under the owner's GitHub account, which Codex used as its connected identity. GitHub does
    not let a PR's author approve or request changes, so the verdict is in the text.
  - The Codex GitHub integration also reported "Didn't find any major issues" at `6f48f1d`.

### RO-007 — Run Milestone 1 app in Expo Go (Owner)
- **Steps:** `git checkout sprint-1-alignment && npm install && cd apps/mobile && npx expo start`, scan QR code.
- **Completion criteria:** start a simulated set, reps count up, stop, set appears in History; result noted on the RO-005 PR.
- **Done — passed 2026-10-16** ([the owner's result on PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3#issuecomment-6227338609)). On an iPhone in
  Expo Go:
  - the app launched;
  - a simulated set counted reps (8 full, 3 partial, 1,800 samples);
  - stopping saved the set, it appeared in History, and it stayed there after the app was restarted.

  This validates the **simulated** workflow and on-device persistence only, **not** sensor performance or real
  rep-detection accuracy. The comment names the branch, not a commit. `apps/` and `packages/` are identical at every
  PR #3 head from `40d4a22` to `6f48f1d` and at the merge `cd884fc`, so the check covers the merged app code. The badge
  clipping noted in the result is recorded as RO-023.

### RO-008 — Update ownership table (docs only)
- **Files:** `docs/architecture.md` §6; `apps/mobile/AGENTS.md` (routes line).
- **Description:** Milestone 1's table follows the original brief (Codex owning `rep-engine`); `AGENTS.md` §2 now
  defines roles (Codex = testing/debugging/review). Align the table; per-task ownership lives in `TASKS.md`.
  Owner, 2026-10-16 (from RO-011 finding 4): also state that the actual Expo Router routes live in `apps/mobile/app/`
  (`apps/mobile/AGENTS.md` still says `src/app/` on `main` @ `2959751`). Not in scope: infrastructure isolation,
  expanded sensor contracts, naming changes (separately approved tasks); the Windows path fix is RO-021.
- **Completion criteria:** table matches `AGENTS.md` §2; routes location stated as `apps/mobile/app/`; PR merged.

### RO-009 / RO-010 — Owner decisions
- RO-009: choose a license (none committed; Expo template license was removed). Criteria: `LICENSE` file merged.
- RO-010: approve or decline recording the `apps/` + `packages/` layout in source of truth §6. Criteria: decision noted in an ADR or the source of truth.

### RO-011 — Architecture review of Milestone 1 (Gemini)
- **Files:** `docs/research/` note or PR review comments; optional ADR with status *Proposed*.
- **Completion criteria:** review covers layer boundaries, placement of simulation inside `sensor-contracts`,
  contract suites, multi-agent parallelism risks; findings linked from the RO-005 PR.
- **Done — merged 2026-10-28 (UTC) as `f41309c`** ([PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8), head `d6ec607`).
  - **Who recorded it:** Gemini did the work. Claude Code records the status under the owner-directed closeout
    exception (`AGENTS.md` §3 step 9).
  - **Evidence:** the report `docs/research/2026-10-16-RO-011-milestone-1-architecture-review.md` covers all four
    areas, and PR #3's description links it and summarises "0 blockers".
    - Codex found no major issues on `d6ec607`, reviewed as a dated record of `40d4a22`.
    - CI on `main` passed after the merge (run [40767477040](https://github.com/bransondang3307-beep/RepOne/actions/runs/40767477040)).
  - **Findings on `main` @ `2959751`** (assessed 2026-10-28, [comment on PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8#issuecomment-6480249138)):
    1. Windows path separators: **historical**, fixed by RO-021 (`cd884fc`).
    2. Infrastructure adapters share one layer, and `application/` may skip the adapter index: **still present**
       (latent) → **RO-025**.
    3. Contract-suite gaps: **still present on `main`**; addressed in RO-012's PR #14 (open; not merged).
    4. Ownership table and routes note: **still present** → **RO-008**.
    5. Display brand → **RO-024**. Brand-neutral H0 header → **RO-016** scope note.
    6. Simulation in the root barrel (§3.2) → **RO-026**.
    7. Contention advice (§5.2): partly historical; the process is now `AGENTS.md` §3 step 9.

### RO-012 … RO-015 — Alignment Milestones 2–5 (part of Sprint 1, not Sprint 2)
- **RO-012 (M2):** sensor error states, multi-channel samples, per-channel engine wrapper (no algorithm change),
  device-connection interface + simulated device. Criteria: contract + channel-independence tests pass; boundaries OK.
  - **Resumed by the owner on 2026-10-23.** Designed in ADR 0007 (Proposed) and delivered in four PRs:
    1. Sensor error states and reasons, contract-suite hardening, session failure handling.
       [PR #14](https://github.com/bransondang3307-beep/RepOne/pull/14).
    2. Channels (`source_id` per IMU) and the per-channel rep-engine wrapper, with channel-independence tests.
       [PR #15](https://github.com/bransondang3307-beep/RepOne/pull/15), stacked on part 1.
    3. `DeviceConnection` contract, `SimulatedDevice` and the device contract suite.
       [PR #16](https://github.com/bransondang3307-beep/RepOne/pull/16), stacked on part 2.
    4. App integration and the `features/device-connection` view; the owner checks it in Expo Go.
       [PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17), stacked on part 3.
  - **Owner decisions, 2026-10-23:**
    - `source_id` stays the sensor identity, with no collisions within a session (`combineChannels`).
    - A "Simulate connection loss" test control is added, for the simulated device only.
    - The synthetic motion stays repeatable (one seed per app start).
  - Not in RO-012: real USB/BLE adapters, the H0 wire format (RO-016) and schema changes (RO-013).
  - The badge fix (RO-023) ships in PR #17 at the owner's request (2026-10-23), as separate `RO-023:` commits. Its
    task row was added by PR #13 (merged as `ad7e047`).
- **RO-013 (M3):** Workout → Exercise → Set → Reps; user-entered resistance (labelled, never "measured");
  machine–exercise links; lifecycle start/pause/resume/finish with validation; SQLite migration. Full reps count
  toward a set, partials logged (ADR 0003). Criteria: domain + persistence tests pass.
- **RO-014 (M4):** home dashboard, exercise selection, pause/reset via application services. Criteria: typecheck,
  tests, Android/iOS export; owner Expo Go check.
- **RO-015 (M5):** boundary validation, full test run, Expo Go, docs + Sprint 1 summary. Codex runs the independent review.
- **Rule:** each starts only after the previous one is merged and the owner approves.

### RO-016 — H0 serial packet schema research (Gemini)
- **Files:** `docs/research/…`, proposed edits to `docs/hardware-protocol.md` (after RO-003 merges).
- **Description:** source of truth §12 open decision 2 — sample rate, ASCII vs binary framing, loss detection,
  timestamps for Uno R3 + MPU-6050. Research only; does not change the rep algorithm.
- **Completion criteria:** cited recommendation with trade-offs; open questions for the owner.
- **Scope note** (owner-directed Milestone 1 closeout, 2026-10-28; RO-011 finding 5; ADR 0006 §3): the stream header
  must be brand-neutral. The draft header `# repone h0 v1` in `docs/hardware-protocol.md` is replaced by a neutral
  one before any firmware or adapter uses it.

### RO-017 — ESLint (Codex)
- **Completion criteria:** lint config committed, `npm run lint` passes, CI runs it; no behaviour changes.

### RO-018 — H0 hardware bring-up (Owner)
- Source of truth §11: locate Uno R3 + GY-521, verify markings/voltage, I²C scan, stream timestamped raw samples.
  Criteria: values change appropriately with movement (source of truth H0-A exit gate).

### RO-019 — Claude Code ↔ Codex workflow at zero additional AI API cost (owner redesign, 2026-10-17)
- **History:** v1 built an API-powered loop ([PR #4](https://github.com/bransondang3307-beep/RepOne/pull/4),
  never enabled), which was then paused ([PR #5](https://github.com/bransondang3307-beep/RepOne/pull/5)). The owner set a
  non-negotiable rule — **$0 separately billed AI API usage** — and approved the redesign: PR #4 is kept as an archive,
  and a separate replacement PR is opened. Manual Claude hand-offs; Auto-fix off; Codex GitHub code review, automatic
  on PR creation, with `@codex review` for re-reviews. This PR goes first; then Milestone 2 (RO-012) resumes.
- **Files:** `docs/automation/{claude-codex-workflow,future-api-loop}.md`, ADR 0005, `scripts/check-workflow-policy{,.test}.mjs`,
  `.github/workflow-policy.json` (empty third-party action allowlist), `package.json` (scripts; devDependency `yaml` 2.9.1 for
  YAML parsing) + `package-lock.json`, `.github/workflows/ci.yml` (manual trigger + policy step), `AGENTS.md` (Review guidelines,
  step 7, zero-cost rule), `CLAUDE.md`, `.github/pull_request_template.md`, `README.md` and `docs/architecture.md`
  (verify description), this row.
- **Completion criteria:** `npm run verify` and CI green; the policy tests detect prohibited AI API integrations
  (including PR #4's real workflows) and enforce least-privilege permissions; Codex review; owner merges. Only
  **after** that merge does the owner close PRs #4 and #5 (unmerged; branches kept as the archive).
- **Done — merged 2026-10-21 (UTC) as `acb9857`** ([PR #11](https://github.com/bransondang3307-beep/RepOne/pull/11), head `45cdbee`, merged by the owner).
  - Codex's final review of `45cdbee` found no findings ("Didn't find any major issues").
  - CI was green on the PR head and again on `main` after the merge (run [39522348555](https://github.com/bransondang3307-beep/RepOne/actions/runs/39522348555)).
  - The owner closed PRs #4 and #5 unmerged right after the merge. Their branches are kept; the archive branch
    `claude/RO-019-claude-codex-loop` is at `af8acd9`.
  - Still open (owner, outside the completion criteria): the archive tag `archive/RO-019-api-loop-v1` (ADR 0005 §6) does
    not exist yet. This environment's GitHub proxy refuses tag pushes.

### RO-020 — Rebrandable naming rule and ADR 0006 (owner directive, 2026-10-16)
- **Files:** `AGENTS.md` §5 (the rule), `docs/decisions/0006-rebrandable-product-identity.md`, the handoff.
- **Description:** "RepOne" is a temporary name. User-facing names come from one brand configuration, core
  functionality stays brand-free, new identifiers are neutral, and existing identifiers are not renamed until the
  owner instructs it. Docs only; the code change is RO-024.
- **Completion criteria:** the rule and ADR merged; the name inventory re-checked against `main`; RO-024 recorded.
- **Done — merged 2026-10-28 (UTC) as `81ccca6`** ([PR #6](https://github.com/bransondang3307-beep/RepOne/pull/6), head `4fa9a9f`).
  - The inventory was re-checked on `4951a37` and is unchanged; RO-024 is recorded.
  - Codex found no major issues on `4fa9a9f`.
  - CI on `main` passed after the merge (run [40767822488](https://github.com/bransondang3307-beep/RepOne/actions/runs/40767822488)).

### RO-021 — Windows path separators in the boundary checker (owner-authorized follow-up to RO-011)
- **Assigned:** owner, 2026-10-16. A narrow follow-up to RO-011 finding 1 ([PR #8](https://github.com/bransondang3307-beep/RepOne/pull/8)):
  `scripts/check-boundaries.mjs` classified layers with `/`, but `path.relative()` returns `\` on Windows.
- **Files:** `scripts/check-boundaries.mjs`, `scripts/check-boundaries.test.mjs`,
  `scripts/test-support/simulate-windows-paths.mjs`, changed in PR #3. Separate from RO-008, which is docs only.
- **Scope:** normalize repo-relative paths to `/`, with no change to the dependency rules, plus a regression test.
  Not in scope: infrastructure-adapter isolation, sensor-contract expansion and naming (RO-011 findings 2–5 go to
  separately approved tasks).
- **Completion criteria:**
  - the finding is reproduced on native Windows before the fix, and passes after it;
  - the regression test fails on the old checker;
  - Codex reviews the PR #3 revision that contains the fix;
  - CI is green on that revision.
- **Done. The fix merged 2026-10-17 (UTC) as `cd884fc`** ([PR #3](https://github.com/bransondang3307-beep/RepOne/pull/3), final head `6f48f1d`). The record
  is [PR #9](https://github.com/bransondang3307-beep/RepOne/pull/9), with the evidence in `docs/handoffs/2026-10-16-claude-RO-021.md`.
  - **Native Windows:** run [38933126592](https://github.com/bransondang3307-beep/RepOne/actions/runs/38933126592) reproduced the bug on `40d4a22`. Injected
    violations were missed, and `npm run verify` exited 1. Run [38933872724](https://github.com/bransondang3307-beep/RepOne/actions/runs/38933872724) passed on
    `6f48f1d` (Node 22 and 24): checker tests 8/8, `npm run verify` exit 0.
  - **Regression test:** `6f48f1d`'s test file against the `40d4a22` checker gives 7/8. Test 8 fails, so Linux CI
    catches the old checker.
  - **Review and CI:** Codex approved PR #3's final head `6f48f1d` (RO-006). PR #3 CI run
    [38933844181](https://github.com/bransondang3307-beep/RepOne/actions/runs/38933844181) succeeded on `6f48f1d`.
  - Native Windows coverage is permanent through RO-022 (below).

### RO-022 — Windows CI job for the boundary checker (owner-approved, 2026-10-16)
- **Why:** RepOne is developed on Windows machines, and RO-021's bugs (the checker's path separators, then its own
  Windows-simulation test) passed Linux CI but failed on native Windows.
- **Files:** `.github/workflows/ci.yml` only — adds a `windows` job. The Linux `verify` and `handoff` jobs are unchanged.
- **Scope:** small: `windows-latest`, Node 24, default line endings; `npm run test:scripts` + `npm run check:boundaries`
  (both `--if-present`, so branches without the checker pass). `npm ci` (npm cache) since PR #11's
  workflow-policy check needs the `yaml` parser. Not in scope without a further decision:
  running the full `npm run verify` (typecheck + Jest) on Windows.
- **Completion criteria:** the job fails on the RO-021 bugs (`40d4a22`, `30e2dd3`) and passes on the fix (`6f48f1d`);
  the Linux job still runs unchanged; Codex review; PR merged by the owner.
- **Done — merged 2026-10-22 (UTC) as `8a70565`** ([PR #10](https://github.com/bransondang3307-beep/RepOne/pull/10), head `2b09895`).
  - The owner explicitly approved merging that exact commit. Claude Code ran the merge, pinned to `2b09895`.
  - Preview runs [38935881737](https://github.com/bransondang3307-beep/RepOne/actions/runs/38935881737) and [38935885847](https://github.com/bransondang3307-beep/RepOne/actions/runs/38935885847) failed
    on the RO-021 bugs; [38935889064](https://github.com/bransondang3307-beep/RepOne/actions/runs/38935889064) passed on the fix.
  - Codex reviewed `2b09895` with no findings.
  - After the merge, CI on `main` passed on both Linux and Windows (run [39701367400](https://github.com/bransondang3307-beep/RepOne/actions/runs/39701367400)).

### RO-023 — Simulated-data warning badge clips on iPhone (recorded 2026-10-23; not fixed yet)
- **Found in:** RO-007, the owner's iPhone Expo Go check (2026-10-16): "the yellow simulated-data warning
  overflows/clips at the screen edge". The owner rated it minor and non-blocking for Milestone 1.
- **Why it matters:** the badge reads "Simulated data — not a real measurement". It is the label that stops synthetic
  rep counts from being mistaken for real ones (`AGENTS.md` §4), so its full text must stay visible.
- **Files (expected):**
  - `apps/mobile/src/shared/components/ProvenanceBadge.tsx`;
  - the home-screen row that holds it, in `apps/mobile/app/index.tsx`.
- **Likely cause** (from the code; not yet confirmed on a device): the badge sits beside the status text in a
  `flexDirection: 'row'` with `justifyContent: 'space-between'`, and neither can shrink or wrap.
- **Completion criteria:**
  - on the owner's iPhone in Expo Go, the whole warning text is visible (wrapped or resized, never clipped) in every
    session state;
  - provenance values and their labels are unchanged;
  - `npm run verify` passes;
  - the owner confirms on the device, and the result is noted on the PR.
- **Scope:** UI layout only; no change to provenance, sensor contracts or rep counting. Priority P3 follows the
  owner's "minor, non-blocking" note; the owner or ChatGPT may raise it.
- **Status:** the fix ships in [PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17), in separate
  `RO-023:` commits, as part of Milestone 2.
  - The owner lifted the Milestone 2 pause on 2026-10-28, and confirmed it on 2026-10-29.
  - PRs #14–#17 are **not merged** yet, and the owner's device check of #17's head is **pending**. RO-023 stays `todo`
    until PR #17 merges and the device check passes.

### RO-024 — Brand configuration for display names (ADR 0006 follow-up; recorded 2026-10-28 at the owner's direction)
- **Files (expected):**
  - `apps/mobile/src/shared/brand.ts` (new, data-only) and `apps/mobile/src/shared/index.ts`;
  - `apps/mobile/app.json` → `apps/mobile/app.config.ts`;
  - `apps/mobile/app/_layout.tsx`;
  - a guard test.
- **Scope:** ADR 0006 Decisions 2 and 4. The display name (and a short name) comes from one place, both for the home
  title and for the installed app's name.
  - The guard test fails when a user-facing source file contains the product name outside the brand configuration.
  - Not in scope: renaming `@repone/*`, the `repone` slug or scheme, `repone.db` or any path (owner instruction
    needed); the draft H0 header (RO-016).
- **Completion criteria:**
  - no literal product name in UI code outside `brand.ts`;
  - the guard test fails on a planted literal and passes on the change;
  - `npm run verify` passes; Codex review;
  - the owner's Expo Go check shows the same visible name as before.
- **Depends on:** RO-020 merged. It is independent of Milestone 2 (RO-012, open). Not started in the Milestone 1
  closeout batch.

### RO-025 — Boundary-checker hardening (RO-011 finding 2; recorded 2026-10-28 at the owner's direction)
- **Files:** `scripts/check-boundaries.mjs`, `scripts/check-boundaries.test.mjs`.
- **Scope:**
  - `layerOf()` captures the adapter name for `apps/mobile/src/infrastructure/<adapter>/`, so one adapter cannot
    import another's internals.
  - `application/` may import infrastructure only through `infrastructure/<adapter>/index.ts`.
  - The dependency rules are otherwise unchanged.
- **Completion criteria:**
  - regression tests show both violations reported, including under the Windows-path simulation;
  - the repository passes;
  - `npm run verify`; CI on Linux and Windows; Codex review.
- **When:** before a second infrastructure adapter (BLE or serial) lands. It is latent today: `database` is the only
  adapter, and the open RO-012 PRs add none.

### RO-026 — Where simulation lives (RO-011 §3.2; recorded 2026-10-28 at the owner's direction)
- **Question:** keep simulation (simulated and replay sources, synthetic scripts and, after RO-012, the simulated
  device) in the root barrel of `@repone/sensor-contracts`? Or expose it through a `./simulation` subpath (or a
  separate package), so pure contract consumers import interfaces only?
- **Owner:** Gemini proposes, with trade-offs; the owner decides. Any change is a separate, approved code task.
- **When:** after RO-012 merges, since its PRs add to `src/simulation/`. P3; no code until decided.
