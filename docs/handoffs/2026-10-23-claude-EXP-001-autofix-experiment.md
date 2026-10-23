# Handoff — EXP-001: Codex-to-Claude Auto-fix trigger experiment (DO NOT MERGE)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-23 |
| **Task** | EXP-001, a disposable experiment authorised by the owner on 2026-10-23. It has no `TASKS.md` row, on purpose: the PR is never merged, so nothing in the task list should change |
| **Branch** | `claude/EXP-001-autofix-experiment` (base: `main` @ `9b8b81a`) |
| **Commits** | `5a5fa13` helper (with the seeded defect), baseline tests and handoff · then the round-1 fix commit, which also updates this file (its SHA is in the PR) |
| **Pull request** | the "DO NOT MERGE — Auto-fix experiment" PR on this branch |
| **Status** | **trigger confirmed**: the Codex finding woke the session by itself. Round 1 is fixed with a regression test, and a re-review is requested |

## Objective
Find out whether a **Codex review comment on its own** wakes a Claude Code cloud session that has **Auto-fix**
(PR activity) turned on for this one PR, so that the session fixes the finding with no human follow-up.

The owner authorised this only as an experiment.
- It is limited to this PR. PRs #16 and #17, and every other PR, are not touched.
- `docs/automation/claude-codex-workflow.md` §10 lists Auto-fix as an option that needs the owner's approval. This
  experiment is that approval for this PR only. It does not change the project's workflow.
- It costs $0 extra: the Claude Pro subscription and Codex on ChatGPT Plus. There are no API keys, no credits, no
  extra usage, no secrets and no new integrations.

## What changed
- **`scripts/experiments/batches.mjs`** (new): `splitIntoBatches(items, size)`, a tiny stand-alone helper.
  - At `5a5fa13` it contained **one deliberate correctness defect**, seeded for this experiment and not described
    anywhere, so that Codex's review was blind.
  - The defect was dropping the final partial batch. Codex found it, and round 1 fixed it (log below).
- **`scripts/experiments/batches.test.mjs`** (new): baseline tests for the helper. They pass.
- **`package.json`:** `test:scripts` also runs the new test file, so CI (Linux and Windows) exercises the helper.

The helper is **disconnected from the application.**
- Nothing in `apps/` or `packages/` imports it.
- The module-boundary checker does not scan `scripts/`.
- No dependency, workflow or app file changed.

## Files changed
- `scripts/experiments/batches.mjs` — added
- `scripts/experiments/batches.test.mjs` — added
- `package.json` — modified (one `test:scripts` entry)
- `docs/handoffs/2026-10-23-claude-EXP-001-autofix-experiment.md` — added

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `node --test scripts/experiments/batches.test.mjs` at `5a5fa13` | 6/6 pass (the baseline tests do not exercise the defect) |
| New regression test, against the unfixed helper (negative control) | **fails** as intended: 6 pass, 1 fail (`keeps the final partial batch`) |
| `node --test scripts/experiments/batches.test.mjs` after the fix | 7/7 pass |
| `npm run verify` (Linux, Node 22.22.0) at `5a5fa13` | exit 0; scripts 68/68; Jest 48/48 |
| CI at `5a5fa13` (baseline) | run 39906276040 success |
| `npm run verify` (Linux, Node 22.22.0) with the fix | exit 0. Boundaries OK; workflow policy OK; typecheck OK; scripts **69/69**; Jest 48/48 (mobile 15, rep-engine 16, sensor-contracts 13, workout-domain 4) |

## Experiment protocol
1. Open the PR as a **draft**, so Codex's automatic review on open does not start before CI.
2. Turn on Auto-fix (PR activity) for **this PR only**.
3. When CI passes on the full head SHA, comment `@codex review`, asking it to inspect the helper's edge cases without
   naming the defect.
4. Wait for a real Codex finding, and **do not fix the defect before it arrives**.
5. **Result:** did the Codex comment itself wake the session (a GitHub event delivered to the session)?
   - **If it did:** fix only the reported issue, add a regression test, push, reply to the finding, and request
     another review.
   - **If it did not:** record that, and leave the defect in place.

## Decisions / ADRs
- none. This is an experiment, not a workflow change (ADR 0005 is unchanged).

## Known limitations / risks
- **The PR must never be merged.** The helper is deliberately wrong at the base commit.
- One run shows whether the trigger works at all, not how reliable it is.

## Next steps
1. Record the result (below) and report it to the owner.
2. **Owner:** close the PR when done. Branch deletion is not available from the cloud session.

## Questions for the owner
- none

## Experiment log
Times are UTC on 2026-10-23. "Session" is the Claude Code cloud session that opened the PR.

| Time | Event |
|---|---|
| 05:31:55 | Draft PR #18 opened at head `5a5fa13` |
| ~05:32 | Session subscribed to PR #18 activity (Auto-fix on for this PR only) |
| 05:32:11 | **Deviation:** Codex began a review before CI finished. The PR description quoted the review command in backticks, and Codex counted that as a "Manual request" even on a draft. The mention was then removed |
| 05:33:16 | Codex posted review `5624318298` with one inline finding, `4356457805`: **[P1] "Include the final partial batch"** at `scripts/experiments/batches.mjs:20`. It correctly identified the seeded defect and suggested `start < items.length` plus regression tests |
| 05:33:20 | GitHub queued `pull_request_review.submitted` and `pull_request_review_comment.created` events (author `chatgpt-codex-connector[bot]`) to the session |
| 05:33:24 | **The idle session woke on those events, with no human message.** The latency from the review being posted was about 8 s |
| 05:34:23 | **Baseline CI passed on `5a5fa13`** (run 39906276040: Boundaries, typecheck and tests: success; Windows — boundary checker and its tests: success; Handoff file present: success), before any fix was pushed |
| 05:33–05:36 | The session checked the finding against GitHub (it is real, on `5a5fa13`) and reproduced it (`[1,2,3]`, size 2 → `[[1,2]]`; `[1,2]`, size 3 → `[]`). It added a regression test that fails without the fix, made the one-line fix, and ran verify |

**Result: triggered.** A Codex bot review comment, on its own, woke the Auto-fix-subscribed session.

**Round 1 fix:**
- `start + size <= items.length` → `start < items.length`.
- The regression test covers both of Codex's examples, plus an exhaustive check over lengths 0–12 and sizes 1–7 that
  every item appears exactly once and only the last batch is short.

**Notes:**
- The finding's text cites "reviewed commit `8a03b9e…`". No commit with that SHA exists in the repository; it is
  probably Codex's internal checkout. GitHub's review metadata and the receipt both name `5a5fa13`.
- Because the review started at PR open, the planned review request after CI was not needed for `5a5fa13`. It is
  used for the fix head instead.
