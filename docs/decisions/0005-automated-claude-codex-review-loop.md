# ADR 0005 — Automated Claude Code ↔ Codex review loop

- **Date:** 2026-10-16
- **Status:** Proposed (owner-requested as RO-019; becomes Accepted when the RO-019 PR is merged)
- **Numbering:** 0003 is used on `sprint-1-alignment`, 0004 on `main`; this is 0005.

## Context

The owner wants Claude Code (developer) and OpenAI Codex (reviewer) to exchange review findings and
fixes through GitHub without manual copying, using the official `anthropics/claude-code-action` and
`openai/codex-action`, with at most two automatic fix rounds, no automatic merges, owner approval
before merging, least privilege, secrets only in Actions secrets, and a manual testing mode.
The repository is private on GitHub Free, so branch protection is unavailable.

## Decision

1. **Two workflows**, `ai-codex-review.yml` and `ai-claude-fix.yml`, chained with `workflow_dispatch`
   (dispatched by the loop with `GITHUB_TOKEN`). No `pull_request_target`, no comment- or review-triggered
   workflows, so PR comments can never start a run.
2. **Off by default.** Repository variable `AI_LOOP_MODE` = `off` (default) / `manual` / `auto`. Manual
   dispatch defaults to `dry_run: true`, which uses a synthetic review and never calls an API.
3. **Loop state lives in PR comments written by `github-actions[bot]`** with a versioned hidden marker.
   Only bot-authored markers are trusted; model text is sanitised so it cannot forge one. Round counts,
   duplicate detection (one review per head SHA) and stale-review detection are re-derived from these
   comments by each gate — workflow inputs are never trusted.
4. **Job isolation:** jobs that execute PR code have no secrets and read-only tokens; jobs holding an AI
   key have read-only tokens (Codex: read-only, no-network sandbox, `drop-sudo`, last step of its job;
   Claude: file tools only, PR copy without `.git`, PR-controlled agent configuration moved out of reach);
   the only `contents: write` job runs no PR code and pushes fast-forward only to the PR's `claude/*`
   branch; reporting/dispatch jobs have no secrets.
5. **Patch policy before push:** protected paths (workflows, agent instruction files at any depth,
   ADRs, task/status files, lockfiles, rep detector and data contracts), size and file-count limits,
   no binaries/symlinks/mode changes; then `npm ci && npm run verify` must pass.
6. **Stop conditions:** Codex approval; 2 fix attempts; any failed/rejected/no-op fix; invalid Codex output;
   label `ai-loop:stop`; mode `off`. Automatic reviews capped at 6 per PR.
7. **No merge path exists** in the workflows or scripts (enforced by `workflow-policy.test.cjs`).
8. All actions pinned to commit SHAs (`claude-code-action` v1.0.248, `codex-action` v1.13, `actions/*`).

## Alternatives considered

- *`@claude` comment-triggered Claude* — rejected: comments become an execution trigger and a prompt
  channel; harder to cap rounds.
- *Pushing with a PAT or GitHub App token* so pushes trigger `pull_request` — rejected: extra long-lived
  credential; explicit dispatch of CI and re-review gives the same effect with `GITHUB_TOKEN`.
- *Letting Claude run tests and push itself* — rejected: the job holding the Anthropic key would execute
  PR code and hold write access.

## Consequences

- Owner must add two API keys and set the mode; costs are per-use (see `docs/automation/claude-codex-loop.md`).
- Bot fix commits do not get automatic `pull_request` CI; the loop dispatches `ci.yml` itself.
- Changes to the loop's own files are never reviewed automatically and can never be made by the loop.
- Merge approval remains procedural until branch protection is available.
