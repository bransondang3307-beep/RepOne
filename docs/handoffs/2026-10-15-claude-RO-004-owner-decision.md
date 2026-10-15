# Handoff — RO-004 follow-up: owner decision on status-update ownership

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-15 |
| **Task** | RO-004 (follow-up after [PR #1](https://github.com/bransondang3307-beep/RepOne/pull/1) merged) |
| **Branch** | `claude/RO-004-owner-decision` (base: `main` @ `75e2814`) |
| **Commits** | see this PR's commit list (single commit "RO-004: apply owner decision on status-update ownership") |
| **Pull request** | opened from this branch → `main` (link in the PR conversation / `TASKS.md` status PR) |
| **Status** | implemented; verified locally; CI pending on the PR |

## Objective
Apply the owner's answer to the open question in `2026-10-15-claude-RO-004.md`:
**each agent opens its own status-update PR; ChatGPT coordinates the roadmap.**

## Background
The decision arrived after PR #1 had already been merged (merge `75e2814`). The change was first
committed on the merged branch (`0ea70f0`, never merged); per the workflow it is re-applied here on a
fresh branch from `main` instead of reusing the merged PR. The merged RO-004 handoff is left unchanged
(handoffs are history).

## What changed
- `AGENTS.md`: ChatGPT row (roadmap coordination; no status edits for others), §3 step 9 rewritten as
  the status-update-PR procedure (`<agent>/<TASK-ID>-status`, title `<TASK-ID>: status update [no-handoff]`,
  own row + matching `PROJECT_STATUS.md` entries, rebase and keep others' rows), §5 task-board rule.
- `CLAUDE.md`, `GEMINI.md`: reminder to open their own status-update PR after merge.
- `docs/agents/CHATGPT.md`: ChatGPT outputs = roadmap, sequencing, assignments, prompts, checking status PRs;
  no status updates for other agents.
- `TASKS.md`, `PROJECT_STATUS.md`: header rules updated (no row/status changes).
- ADR 0004: Decision 4 amended with the owner decision; status → Accepted.
- PR template: status-update PR checkbox. `docs/handoffs/README.md`: suffix naming + index row.

## Files changed
- Modified: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `TASKS.md`, `PROJECT_STATUS.md`, `docs/agents/CHATGPT.md`,
  `docs/decisions/0004-multi-agent-synchronization.md`, `.github/pull_request_template.md`, `docs/handoffs/README.md`
- Added: this handoff. No files under `packages/` or `apps/` changed.

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | core **45/45**, mobile **1/1** passed |
| `git diff origin/main -- packages apps` | empty (docs only) |
| CI on `main` @ `75e2814` after PR #1 merged | run 38807737485 — **success** |

## Decisions / ADRs
- ADR 0004 Decision 4 amended (owner decision 2026-10-15).

## Known limitations / risks
- Concurrent status PRs can touch the same `PROJECT_STATUS.md` section; agents must rebase and keep both entries.
- Stale branch `claude/RO-004-agent-sync` still holds unmerged `0ea70f0` (superseded by this PR); safe to delete after this merges.

## Next steps
1. Owner reviews and merges this PR.
2. Claude Code opens the RO-004 status-update PR (`claude/RO-004-status`): RO-004 → `done`, `PROJECT_STATUS.md`
   moves the sync setup to "Verified on `main`" — first use of the new convention.
3. RO-005: PR for `sprint-1-alignment`.

## Questions for the owner
- May I delete the superseded remote branch `claude/RO-004-agent-sync` after this merges?
