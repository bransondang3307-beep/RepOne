# RepOne — Tasks

> Shared task board for all agents. Rules (`AGENTS.md` §3–4):
> - Work only on tasks assigned to you; branch `<agent>/<TASK-ID>-<slug>`; commits start with the task ID.
> - Edit only your own task's row/section. ChatGPT proposes new tasks/assignments; the owner commits them (roadmap PR).
> - After your work PR merges, set your row to `done` in your **own** status-update PR (`AGENTS.md` §3 step 9).
> - `done` = PR **merged into `main`** and completion criteria verified. Record the merge commit.
> - Status: `todo` · `in-progress` · `in-review` · `done` · `blocked`. Priority: **P1** (now) · **P2** (next) · **P3** (later).
> - Next free ID: **RO-019**.

## Board

| ID | Title | Owner | Pri | Status | Depends on | Branch / PR |
|---|---|---|---|---|---|---|
| RO-001 | Sprint 1 foundation (core + Expo app) | Claude Code | — | done | — | `main` @ `1b7e5b9` (pushed directly; pre-workflow) |
| RO-002 | Publish repository to private GitHub | Claude Code | — | done | RO-001 | `main` @ `d9a7274` |
| RO-003 | Milestone 1: align module layout with full Sprint 1 brief | Claude Code | P1 | in-progress | — | `sprint-1-alignment` (no PR yet → RO-005) |
| RO-004 | Multi-agent synchronization setup | Claude Code | P1 | in-review | — | `claude/RO-004-agent-sync` — [PR #1](https://github.com/bransondang3307-beep/RepOne/pull/1) |
| RO-005 | Open PR for `sprint-1-alignment` → `main` | Claude Code | P1 | todo | RO-004 | — |
| RO-006 | Review Milestone 1 PR | Codex | P1 | todo | RO-005 | — |
| RO-007 | Run Milestone 1 app in Expo Go | Owner | P1 | todo | — | — |
| RO-008 | Update `docs/architecture.md` §6 ownership to `AGENTS.md` roles | Claude Code | P2 | todo | RO-003 merged | — |
| RO-009 | Choose a project license | Owner | P3 | todo | — | — |
| RO-010 | Decide whether to record the app layout in source of truth §6 | Owner (ChatGPT prepares) | P3 | todo | RO-003 merged | — |
| RO-011 | Architecture review of Milestone 1 layout (ADR 0003) | Gemini | P2 | todo | RO-005 | — |
| RO-012 | Alignment Milestone 2: contracts, multi-channel engine wrapper, device connectivity | Claude Code | P2 | todo | RO-003 merged, owner go-ahead | — |
| RO-013 | Alignment Milestone 3: workout domain + persistence | Claude Code | P2 | todo | RO-012 | — |
| RO-014 | Alignment Milestone 4: mobile UI | Claude Code | P2 | todo | RO-013 | — |
| RO-015 | Alignment Milestone 5: integration + Sprint 1 close-out | Claude Code + Codex | P2 | todo | RO-014 | — |
| RO-016 | Research: H0 serial packet schema and sample rate | Gemini | P2 | todo | — | — |
| RO-017 | Add ESLint config and lint step to CI | Codex | P3 | todo | RO-004 merged | — |
| RO-018 | H0 hardware bring-up: verify parts, I²C scan, stream raw IMU | Owner | P2 | todo | — | — |

## Task details

### RO-003 — Milestone 1: align module layout with the full Sprint 1 brief
- **Files:** whole repo layout (see `docs/decisions/0003-full-spec-module-layout.md` on the branch).
- **Description:** restructure only; no behaviour change. Already implemented on `sprint-1-alignment` @ `6e79ee3`.
- **Completion criteria:** PR merged; CI green; `npm run verify` passes (boundaries, typecheck, 46/46 tests);
  owner confirms the app runs in Expo Go (RO-007); Codex review approved (RO-006).

### RO-004 — Multi-agent synchronization setup
- **Files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/agents/CHATGPT.md`, `PROJECT_STATUS.md`, `TASKS.md`,
  `docs/handoffs/{README,TEMPLATE}.md`, `.github/pull_request_template.md`, `.github/workflows/ci.yml`, ADR 0004.
- **Description:** shared instructions, tracker, task board, handoff system, PR template and CI so all agents
  work from the same context. No code, test or algorithm changes.
- **Completion criteria:** PR merged; CI workflow runs green on `main`; `CLAUDE.md`/`GEMINI.md` load `AGENTS.md`.

### RO-005 — Open PR for `sprint-1-alignment`
- **Files:** none changed beyond merging `main` into the branch if needed (+ its handoff).
- **Completion criteria:** PR open against `main` using the PR template, CI result reported, handoff added.

### RO-006 — Review Milestone 1 PR (Codex)
- **Files:** review only; fixes go on `codex/RO-006-…` branches or as PR suggestions.
- **Description:** check module boundaries vs `docs/architecture.md`, that no behaviour changed (same tests),
  contract suites, and the boundary checker's rules. Run `npm run verify` independently.
- **Completion criteria:** written review on the PR with the exact test output; blocking issues listed or approval given.

### RO-007 — Run Milestone 1 app in Expo Go (Owner)
- **Steps:** `git checkout sprint-1-alignment && npm install && cd apps/mobile && npx expo start`, scan QR code.
- **Completion criteria:** start a simulated set, reps count up, stop, set appears in History; result noted on the RO-005 PR.

### RO-008 — Update ownership table
- **Files:** `docs/architecture.md` §6.
- **Description:** Milestone 1's table follows the original brief (Codex owning `rep-engine`); `AGENTS.md` §2 now
  defines roles (Codex = testing/debugging/review). Align the table; per-task ownership lives in `TASKS.md`.
- **Completion criteria:** table matches `AGENTS.md` §2; PR merged.

### RO-009 / RO-010 — Owner decisions
- RO-009: choose a license (none committed; Expo template license was removed). Criteria: `LICENSE` file merged.
- RO-010: approve or decline recording the `apps/` + `packages/` layout in source of truth §6. Criteria: decision noted in an ADR or the source of truth.

### RO-011 — Architecture review of Milestone 1 (Gemini)
- **Files:** `docs/research/` note or PR review comments; optional ADR with status *Proposed*.
- **Completion criteria:** review covers layer boundaries, placement of simulation inside `sensor-contracts`,
  contract suites, multi-agent parallelism risks; findings linked from the RO-005 PR.

### RO-012 … RO-015 — Alignment Milestones 2–5 (part of Sprint 1, not Sprint 2)
- **RO-012 (M2):** sensor error states, multi-channel samples, per-channel engine wrapper (no algorithm change),
  device-connection interface + simulated device. Criteria: contract + channel-independence tests pass; boundaries OK.
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

### RO-017 — ESLint (Codex)
- **Completion criteria:** lint config committed, `npm run lint` passes, CI runs it; no behaviour changes.

### RO-018 — H0 hardware bring-up (Owner)
- Source of truth §11: locate Uno R3 + GY-521, verify markings/voltage, I²C scan, stream timestamped raw samples.
  Criteria: values change appropriately with movement (source of truth H0-A exit gate).
