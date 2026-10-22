# Handoff — RO-019 / RO-022: post-merge status update (docs only)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-22 |
| **Task** | RO-019 and RO-022 (`TASKS.md`): the post-merge status follow-up from `AGENTS.md` §3 step 9, requested by the owner |
| **Branch** | `claude/RO-019-RO-022-status-done` (base: `main` @ `8a70565`) |
| **Commits** | see the PR's commit list (docs only) |
| **Pull request** | opened from this branch; see `TASKS.md` and the PR list |
| **Status** | implemented; docs only; awaiting Codex review and the owner's merge |

## Objective
Mark RO-019 and RO-022 `done` in `TASKS.md`, citing their merge commits (`acb9857`, `8a70565`). Update
`PROJECT_STATUS.md` to reflect the merged work, keeping Milestone 2 (RO-012) paused.

## Repository state checked first (2026-10-22)
- **`main` @ `8a70565`.** The first-parent merges are PR #1 `75e2814` (2026-10-15), PR #3 `cd884fc` (2026-10-17),
  PR #11 `acb9857` (2026-10-21) and PR #10 `8a70565` (2026-10-22), all in UTC. CI on `main` after each merge succeeded:
  runs 38807737485, 38986550607, 39522348555 and 39701367400.
- **RO-019 completion criteria met:**
  - CI green on the PR head and on `main`.
  - The policy tests are part of the 62 script tests.
  - Codex's final review of `45cdbee` had no findings (comment 6301249064; review-state `has_any_findings: false`).
  - The owner merged the PR, then closed PRs #4 and #5 unmerged (00:36:47Z and 00:36:49Z).
  - The archive branch `claude/RO-019-claude-codex-loop` is at `af8acd9`.
  - **Not done:** the archive tag `archive/RO-019-api-loop-v1`. `git ls-remote --tags` shows no tags; this environment's
    GitHub proxy refuses tag pushes. It is not in the `TASKS.md` completion criteria, so it is listed as an owner item.
- **RO-022 completion criteria met:**
  - Preview runs failed on both RO-021 bugs and passed on the fix.
  - The Linux job is unchanged.
  - Codex reviewed `2b09895` with no findings.
  - Merged as `8a70565`. The owner explicitly approved that exact head; Claude Code ran the merge pinned to its SHA.
  - Post-merge CI passed on Linux and Windows.
- **RO-012:** no branch and no local work; it has not been started. Its `TASKS.md` row is unchanged (`todo`), and
  `PROJECT_STATUS.md` records it as **paused** until the owner resumes it.
- **Milestone 1 evidence:** Codex reviewed PR #3's head `6f48f1d` with no major issues, and the owner's RO-007 comment
  on PR #3 records the iPhone Expo Go check as passed (simulated data only). `cd884fc`'s second parent is `6f48f1d`.
- **Open PRs:** #2, #6, #7, #8 and #9. Only my own PRs, #2 and #9, touch `TASKS.md` or `PROJECT_STATUS.md`, so no
  other agent's open PR is affected. PR #9 already conflicts with `main`.

## What changed
- **`TASKS.md`**, only the RO-019 and RO-022 rows and sections, plus the next-free-ID line:
  - status `in-review` → `done`;
  - Branch / PR column → `[PR #…] — merged <sha>`;
  - a "Done" entry under each task's details, with the evidence above.
  - The next free ID stays RO-023.
- **`PROJECT_STATUS.md`** now reflects `main` @ `8a70565`. The previous version described `main` @ `d9a7274` and the
  removed `packages/core`.
  - New "Merged into `main`" table.
  - "Verified on `main`" re-derived from this session's `npm run verify`, CI run 39701367400 and the RO-007 device
    check; it uses the current package layout.
  - Open PRs and branches; Milestone 2 **paused**.
  - Blockers, next steps, and the `$0 AI API` line.
  - The change log keeps the original row.
- **`docs/handoffs/README.md`:** index entries for this handoff and my earlier handoffs already on `main` (RO-005,
  RO-022, RO-019), which were missing.
- **Not changed:** the RO-003…RO-007 rows. Milestone 1 merged, but this follow-up is limited to RO-019 and RO-022.
  Next steps lists the stale rows for their owners. No code, CI, ADR or `AGENTS.md` changes.

## Files changed
- `TASKS.md` — modified (RO-019, RO-022, next-free-ID line)
- `PROJECT_STATUS.md` — modified (rewritten for `main` @ `8a70565`)
- `docs/handoffs/README.md` — modified (index)
- `docs/handoffs/2026-10-22-claude-RO-019-RO-022-status.md` — added

## Tests and checks (exact results)
Docs only. No code tests are required, but they were run anyway, on this branch and on `main` @ `8a70565`.

| Command | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm run verify` | exit 0. Boundaries OK (58 files, no circular imports); workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files); typecheck OK; Jest 48/48 (mobile 15, rep-engine 16, sensor-contracts 13, workout-domain 4) |
| `npm run test:scripts` | exit 0. tests 62, pass 62, fail 0 |

Environment notes: Linux container, Node 22.22.0. CI results for this PR are on the PR itself.

## Decisions / ADRs
- none

## Known limitations / risks
- `TASKS.md` and `PROJECT_STATUS.md` will conflict with PR #2 (and PR #9 already conflicts). Both are my PRs and need
  updating against `main` after this merges.
- The RO-003…RO-007 rows remain stale until their owners update them.

## Next steps
1. **Codex:** review this PR (docs only). Check that every claim matches `main` and the linked runs and comments.
2. **Owner:** merge decision. Manual items: the archive tag, deleting the four `claude/RO-022-preview-*` branches,
   keeping the account $0 settings.
3. **Owner or ChatGPT:** decide who updates the Milestone 1 rows (RO-003…RO-007), and assign a task ID (next free:
   RO-023) for the iPhone warning-badge clipping.
4. **RO-012 (Milestone 2):** stays paused until the owner's explicit go-ahead.

## Questions for the owner
- Should Claude Code also open the Milestone 1 status follow-up (RO-003, RO-004, RO-005 → `done`)? RO-006 belongs to
  Codex and RO-007 to the owner.
