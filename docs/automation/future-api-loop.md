# Archived design: API-powered Claude Code ↔ Codex review loop (RO-019 v1)

> **Status: archived. It was never enabled and is not adopted.** It needs separately billed AI API usage, which the
> owner's rule rules out (2026-10-17: $0 additional AI API cost; [ADR 0005](../decisions/0005-zero-cost-claude-codex-collaboration.md)).
> The current workflow is [`claude-codex-workflow.md`](claude-codex-workflow.md).
>
> **Where the code lives:** [PR #4](https://github.com/bransondang3307-beep/RepOne/pull/4) — branch
> `claude/RO-019-claude-codex-loop` @ `af8acd9` (2,879 lines in 24 files). It is kept unmerged, together with the
> archive tag `archive/RO-019-api-loop-v1` (see the RO-019 zero-cost handoff for whether the tag exists). The pause
> record and independent-review concerns are in [PR #5](https://github.com/bransondang3307-beep/RepOne/pull/5).
> This page is the portfolio summary, so the design survives even if those PRs are closed.

## 1. What it did

```text
Claude opens / pushes a PR on a claude/* branch  (auto mode)  or  owner dispatches the review (manual mode)
        ▼
"AI loop · Codex review"   gate → verify (npm ci && npm run verify) → Codex (read-only sandbox) → post
        ├─ no blocking findings ─► label ai-loop:approved, STOP — owner reviews and merges
        ├─ 2 fix rounds used ─────► label ai-loop:needs-human, STOP
        └─ blocking findings ─────► dispatch "AI loop · Claude fix" (round n+1)
"AI loop · Claude fix"     gate → Claude (file edits only) → patch policy + verify → push → report
        ├─ failure / no change / rejected ─► label ai-loop:needs-human, STOP
        └─ pushed ─► dispatch CI on the branch + dispatch the Codex re-review ─► (back to the top)
```

- Built on the official `openai/codex-action` (needs `OPENAI_API_KEY`) and `anthropics/claude-code-action`
  (needs `ANTHROPIC_API_KEY`), both pinned to commit SHAs.
- Modes via the repository variable `AI_LOOP_MODE`: `off` (default; manual dispatch is dry-run only), `manual`, `auto`.
- At most **two automatic fix rounds** per PR and at most **six automatic reviews**. It never merges and never approves.

| Part | Files |
|---|---|
| Review workflow | `.github/workflows/ai-codex-review.yml` (gate · verify · codex · post) |
| Fix workflow | `.github/workflows/ai-claude-fix.yml` (gate · claude · verify-fix · push · report) |
| Logic (Node, no dependencies) | `.github/ai-loop/{config,lib,gate,post-review,finish-fix,cli}.cjs` |
| Prompts and output schema | `.github/ai-loop/prompts/{codex-review,claude-fix}.md`, `codex-review.schema.json`, dry-run fixture |
| Tests | 62 tests: `lib`, `gate`, `orchestration`, `workflow-policy` (`.github/ai-loop/tests/`) |
| Docs | `docs/automation/claude-codex-loop.md`, draft ADR 0005 "Automated Claude Code ↔ Codex review loop" |

## 2. Security design — lessons kept for later work

The design assumed that **PR content is untrusted input fed to AI agents that hold credentials**. These lessons
carry over to any future automation:

1. **Least privilege per job.**
   - Workflows start from `permissions: {}`, and each job declares only what it needs.
   - The AI jobs had **read-only** tokens.
   - Jobs with write access (post, push, report) held **no AI secrets** and did not run PR code.
   - Only the push job kept checkout credentials.
2. **Secrets scoped to one job each.** `OPENAI_API_KEY` was visible only to the Codex job and `ANTHROPIC_API_KEY`
   only to the Claude job. Model output was scrubbed for secret-shaped strings before posting.
3. **Prompt-injection boundary.**
   - Only the prompt and a trusted copy of the rules counted as instructions.
   - The diff, comments, commit messages and test output were labelled as data.
   - The PR's own `AGENTS.md` and `.codex` files were moved out of the agent's working directory, so a PR could not
     rewrite the reviewer's instructions.
4. **Sandboxing.** Codex ran in a read-only, no-network sandbox with `drop-sudo`, as the last step of its job.
   Claude had file tools only: no shell, no web, and a copy of the PR without `.git`.
5. **Patch policy before any push.**
   - Claude's changes were overlaid on a pristine checkout and checked against protected paths: workflows, agent
     instructions, `TASKS.md`/`PROJECT_STATUS.md`, ADRs, lockfiles, the rep detector and data contracts.
   - The fix had to pass `npm ci && npm run verify`.
   - It was pushed as one commit, fast-forward only, never to the default or an unprefixed branch, never forced.
6. **Bounded autonomy.**
   - Round and review caps.
   - The `ai-loop:stop` label and `AI_LOOP_MODE=off` as kill switches.
   - Dry-run is the default for manual dispatch.
   - Automatic runs skipped PRs that change the automation itself.
7. **No merge or approve path**, proven by a policy test rather than promised.
8. **Supply chain and injection hygiene.**
   - Actions pinned to full SHAs.
   - `${{ }}` expressions never inside `run:` blocks; inputs go through `env:`.
   - No `pull_request_target`.
9. **Policy as tests.** `workflow-policy.test.cjs` encoded rules 1–8. A mutation check injected six violations,
   and all six were detected.

What carried over into the zero-cost workflow:

| v1 element | Now |
|---|---|
| Workflow-policy tests | `scripts/check-workflow-policy.mjs` + tests: least privilege, triggers, merge/approve paths, script injection, SHA pinning, **plus** detection of any AI API integration |
| Review prompt and P0–P3 severity scheme | `AGENTS.md` → "Review guidelines", which Codex code review follows |
| Claude fix prompt | Copy-paste prompt in `claude-codex-workflow.md` §6 |
| 2-round cap; never merge or approve; protected areas | Process rules in `claude-codex-workflow.md` §3–§5 and the PR template |
| `workflow_dispatch` on CI | Kept (manual CI re-run) |

## 3. Cost: why it was not adopted

These estimates were made on 2026-10-16 and not re-verified:

- **Claude fix round:** about $0.50–$4 on Opus 5.5 (roughly half on Sonnet 5.5).
- **Codex review:** about $0.15–$1.60.
- **Per PR:** typically about $1–$6; worst case about $5–$13 (3 reviews + 2 fix rounds).
- **GitHub Actions:** about 8–17 minutes per real review and 11–28 minutes per real fix round.

The owner already pays for ChatGPT Plus, Claude Pro and Google AI Pro, and decided against any pay-per-token API
billing. The zero-cost workflow covers the same hand-off with manual initiation.

## 4. Open review concerns (from the independent review, PR #5)

These were never resolved, because the loop was paused first:

1. **CI on the exact head SHA.**
   - The loop must count as complete only with a passing Codex review **and** passing CI for the same commit.
   - A failed dispatch, or a missing, skipped, delayed or failed run, must never count as success.
   - Review approval and CI verification stay separate statuses.
   - Needs tests for each CI outcome.
2. **Manual override and API cost safeguards.**
   - A `force=true` manual dispatch bypassed duplicate-review prevention and the review cap.
   - Overrides must be limited to authorised actors, with explicit automatic vs manual limits and a guard against
     repeated paid calls.
3. **Comment-based state.**
   - Loop state lived in bot comment markers.
   - Edited, malformed, duplicated and reordered comments must not bypass the round cap.
   - Needs tests and documented trust limits.

## 5. Prerequisites if it is ever revived

1. The owner explicitly approves paid API usage, with a budget and spend limits in dedicated OpenAI and Anthropic
   projects. A new ADR supersedes ADR 0005.
2. Concerns 1–3 above are fixed, with regression tests.
3. `scripts/check-workflow-policy.mjs` is changed **deliberately**, in that PR, to admit exactly the reviewed AI
   jobs. Today it rejects PR #4 with 23 violations: AI actions, AI credentials, non-`GITHUB_TOKEN` secrets, and
   write scopes without a `least-privilege` reason.
4. A fresh independent review is done, then the staged test plan from `claude-codex-loop.md` §5 (dry run first).
