# ADR 0004 — Multi-agent synchronization workflow

- **Date:** 2026-10-15
- **Status:** Proposed (accepted when the RO-004 PR is merged by the owner)
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
   file → PR to `main` → review + green CI → owner merges → **the same agent** opens its own
   status-update PR (`TASKS.md` row → `done`, `PROJECT_STATUS.md` entry) after merge.
   *Owner decision 2026-10-15:* each agent owns its status updates for traceability and to avoid
   conflicting direct edits; ChatGPT coordinates the roadmap (priorities, sequencing, new tasks and
   assignments, committed by the owner) but does not write other agents' status.
5. **Automation:** GitHub Actions CI (`npm ci`, boundary check when present, typecheck, tests) on every
   PR and on `main`, plus a check that each PR adds a handoff file. A PR template mirrors the handoff.

## Consequences

- Any agent can start cold from `main` and reach the same context in a fixed reading order.
- "PR + review before merge" is a convention, not an enforced rule, until branch protection is available.
- Status updates lag merges by one small PR per task; this keeps `PROJECT_STATUS.md` truthful and every
  status change traceable to the agent and merged PR behind it. Concurrent status PRs may touch the same
  section of `PROJECT_STATUS.md`; agents rebase and keep both entries.
- CI uses GitHub Actions minutes on a private repo (Free plan includes a monthly allowance).
