# Handoff — EXP-001: Codex-to-Claude Auto-fix trigger experiment (DO NOT MERGE)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-23 |
| **Task** | EXP-001, a disposable experiment authorised by the owner on 2026-10-23. It has no `TASKS.md` row, on purpose: the PR is never merged, so nothing in the task list should change |
| **Branch** | `claude/EXP-001-autofix-experiment` (base: `main` @ `9b8b81a`) |
| **Commits** | see the PR; this file records each round |
| **Pull request** | the "DO NOT MERGE — Auto-fix experiment" PR on this branch |
| **Status** | implemented · baseline verified · experiment running |

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
  - **It contains one deliberate correctness defect, seeded for this experiment.**
  - The defect is not described here, in the code or in the PR, so that Codex's review is blind. The owner has the
    details in the session report.
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
| `node --test scripts/experiments/batches.test.mjs` | 6/6 pass |
| `npm run verify` (Linux, Node 22.22.0) | recorded in the PR body for each head |

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
_(Filled in as the experiment runs.)_
