# ADR 0004 — Multi-agent synchronization workflow

- **Date:** 2026-10-15
- **Status:** Accepted 2026-10-15. The owner merged the RO-004 PR ([PR #1](https://github.com/bransondang3307-beep/RepOne/pull/1), `75e2814`), which was this ADR's
  acceptance condition.
- **Amended:** Decision 4, status-update ownership. Owner decisions of 2026-10-15 and 2026-10-28, recorded in [PR #19](https://github.com/bransondang3307-beep/RepOne/pull/19),
  which supersedes [PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2).
- **Numbering note:** ADR 0003 is used on the unmerged `sprint-1-alignment` branch, so this ADR takes 0004.

## Context

Claude Code, OpenAI Codex, Gemini and ChatGPT contribute to RepOne. Each tool loads a different
instruction file (Claude Code → `CLAUDE.md`, Codex → `AGENTS.md`, Gemini CLI → `GEMINI.md`;
ChatGPT loads nothing automatically). Without one shared source, instructions, progress and task
ownership drift. GitHub branch protection is unavailable on this private repo's plan.

## Decision

1. **One canonical instruction file:** `AGENTS.md`. `CLAUDE.md` and `GEMINI.md` import it with `@`
   and add only tool-specific notes; ChatGPT gets a paste-in prompt (`docs/agents/CHATGPT.md`) that
   points at the same files.
2. **Shared state in the repo:** `PROJECT_STATUS.md` (merged + verified state only) and `TASKS.md`
   (IDs `RO-###`, owner, priority, status, dependencies, completion criteria).
3. **Roles:** Claude Code = main developer; Codex = testing, debugging, review; Gemini = research,
   architecture, design; ChatGPT = project management; owner = approvals, merges, hardware/device tests.
4. **Workflow:** sync from `origin/main` → work on `<agent>/<TASK-ID>-<slug>` → run tests → handoff
   file → PR to `main` → review + green CI → owner merges → status/task updates in a follow-up after merge.
   **Status-update ownership** (owner decision of 2026-10-15, refined on 2026-10-28):
   - **Default:** the agent that completed the work opens its own status-update PR. It may cover several of that
     agent's tasks, and it may include a handoff.
   - **Exceptions:** Claude Code may record the owner's device checks, Codex review tasks and closeouts the owner
     explicitly directs, each with its supporting evidence.
   - **Roadmap:** ChatGPT proposes roadmap changes (priorities, sequencing, new tasks and assignments). The owner,
     or an agent acting at the owner's direction, commits them. ChatGPT does not write status updates.

   The working rule is `AGENTS.md` §3 step 9.
5. **Automation:** GitHub Actions CI (`npm ci`, boundary check when present, typecheck, tests) on every
   PR and on `main`, plus a check that each PR adds a handoff file. A PR template mirrors the handoff.

## Consequences

- Any agent can start cold from `main` and reach the same context in a fixed reading order.
- "PR + review before merge" is a convention, not an enforced rule, until branch protection is available.
- Status updates lag merges by one small PR per agent. This keeps `PROJECT_STATUS.md` truthful, and traces every
  status change to the agent and the merged PR behind it. Concurrent status-update PRs may change the same section;
  agents keep both entries.
- The exceptions cover work whose owner does not open PRs: the owner's device checks, and Codex's reviews through
  its GitHub integration. They also cover closeouts the owner directs, such as the Milestone 1 closeout (PR #13).
  Each exception links its evidence.
- CI uses GitHub Actions minutes on a private repo (Free plan includes a monthly allowance).
