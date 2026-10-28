# Handoff — RO-004 follow-up: status-update ownership (owner decision 2026-10-28), ADR 0004 Accepted

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-28 |
| **Task** | RO-004 follow-up (`TASKS.md`, RO-004 section), at the owner's direction |
| **Branch** | `claude/RO-004-status-ownership` (base: `main` @ `ad7e047`, the PR #13 merge) |
| **Commits** | one docs-only commit, `RO-004: status-update ownership …` (its SHA is in PR #19) |
| **Pull request** | [PR #19](https://github.com/bransondang3307-beep/RepOne/pull/19). It **supersedes [PR #2](https://github.com/bransondang3307-beep/RepOne/pull/2)**, which stays open until the owner closes it |
| **Status** | implemented; checks run (below); awaiting Codex review and the owner's merge |

## Objective
Replace PR #2 with a clean docs-only PR against current `main`. It records the owner's decision of 2026-10-28 on
who writes status updates (option (b): keep the 2026-10-15 rule, with exceptions) and marks ADR 0004 Accepted.

## Owner decision applied (2026-10-28)
1. **Default:** the agent that completed the work opens its own status-update PR. It may cover several of that
   agent's tasks and include a handoff.
2. **Exceptions:** Claude Code may record the owner's device checks, Codex review tasks and closeouts the owner
   explicitly directs, with supporting evidence.
3. **Roadmap:** ChatGPT proposes roadmap changes. The owner, or an agent acting at the owner's direction, commits
   them.

## What changed
- **`AGENTS.md`:**
  - §2: the ChatGPT row now reads "roadmap coordination". ChatGPT proposes roadmap changes, prepares prompts and checks
    status-update PRs; it does not push or write status updates.
  - §3 step 9 is rewritten with the default, the three exceptions, the sync/keep-both-entries rule, and the
    `[no-handoff]` title for a status PR without a handoff.
  - §5: the `TASKS.md` bullet allows the step 9 exceptions. A new bullet says who proposes and who commits roadmap
    changes.
- **`CLAUDE.md`, `GEMINI.md`:** each points to its own status-update PR. `CLAUDE.md` also names Claude Code's
  exceptions.
- **`docs/agents/CHATGPT.md`** (the paste-in prompt): the role is roadmap coordination. ChatGPT no longer drafts
  `PROJECT_STATUS.md` updates, it checks status PRs, and roadmap text is committed by the owner or an agent at the
  owner's direction.
- **`.github/pull_request_template.md`:** the `PROJECT_STATUS.md` line points to the status-update PR (step 9).
- **`TASKS.md`:**
  - the header rules match step 9;
  - in the RO-004 section, the follow-up is now PR #19, which supersedes PR #2. The RO-004 row itself is
    unchanged: `done` since `75e2814`.
- **ADR 0004:**
  - **Status: Accepted 2026-10-15.** The owner merged PR #1 (`75e2814`), which was the ADR's own acceptance
    condition.
  - Decision 4 is amended with the ownership rule (owner decisions of 2026-10-15 and 2026-10-28).
  - The consequences explain why the exceptions exist.
- **`PROJECT_STATUS.md`:**
  - the header rule matches step 9;
  - the "ADR 0004 still says Proposed" item points to PR #19;
  - PR #2's row now says it is superseded, and corrects an earlier claim (below);
  - a PR #19 row is added, and the recommended order and next steps point to it;
  - a change-log row is added.
- **`docs/handoffs/README.md`:** the naming rule now allows a slug for a second handoff on a task, or for one
  covering several tasks, which matches existing files such as `2026-10-23-claude-RO-003-m1-closeout.md`. The index
  has this handoff.

**What PR #2 had that this PR does not take:**
- "Committed by the owner in a roadmap PR" (now: the owner, or an agent at the owner's direction).
- The rule that one agent may never edit another's status (now: with the three exceptions).
- The fixed status-PR format: one task per PR, always `[no-handoff]`. Now a status PR may cover several tasks and
  may include a handoff.
- PR #2's own 2026-10-15 handoff, which stays on its branch as history.

**Correction of my 2026-10-23 assessment.** `PROJECT_STATUS.md` said that rebasing PR #2 "would conflict
throughout". A trial merge of PR #2 into `main` @ `ad7e047` on 2026-10-28 conflicted in only one
`docs/handoffs/README.md` index row. The PR #2 row now says so.

## Files changed
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/agents/CHATGPT.md`, `.github/pull_request_template.md` — modified
- `TASKS.md`, `PROJECT_STATUS.md` — modified
- `docs/decisions/0004-multi-agent-synchronization.md` — modified
- `docs/handoffs/README.md` — modified; `docs/handoffs/2026-10-28-claude-RO-004-status-ownership.md` — added

## Tests and checks (exact results)
Docs only: no code tests are required. The checks were run anyway; exact results are in the PR description.

| Command | Result |
|---|---|
| `npm ci` + `npm run verify` (Linux, Node 22.22.0) | in the PR description |
| Trial merges with the other open PRs that touch these files | in the PR description |

## Decisions / ADRs
- ADR 0004 is Accepted, with Decision 4 amended (owner decisions of 2026-10-15 and 2026-10-28).
- `REPONE_SOURCE_OF_TRUTH.md` is not changed. Its §10 role line for ChatGPT ("prioritization, agent coordination")
  already fits the decision.

## Known limitations / risks
- **The rule is a convention.** Branch protection is unavailable, so the review checks it.
- **PR #2 stays open until the owner closes it.** It conflicts with this PR in every file both change, so it must not
  be merged.
- **Out of scope here; separate status updates under the new rule:**
  - The snapshot at the top of `PROJECT_STATUS.md` still describes `main` @ `9b8b81a`. Recording PR #13's merge
    (`ad7e047`) there is Claude Code's own status update.
  - `PROJECT_STATUS.md` still says Milestone 2 "has no branch", although the paused RO-012 PRs #14–#17 exist. This
    is RO-012's status update; RO-012 stays paused.

## Next steps
1. **Codex:** review PR #19's head (docs only).
2. **Owner:** merge PR #19, then close PR #2 unmerged.
3. **Claude Code:** after the merge, a status-update PR under the new rule. It records PR #13's merge and refreshes
   the `PROJECT_STATUS.md` snapshot, if the owner wants that now.

## Questions for the owner
- none
