# Handoff — RO-003…RO-007, RO-023: Milestone 1 closeout (docs only)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-23 |
| **Task** | Milestone 1 closeout requested by the owner: reconcile RO-003…RO-007 (`TASKS.md`), record RO-023, update `PROJECT_STATUS.md` |
| **Branch** | `claude/RO-003-m1-closeout` (base: `main` @ `9b8b81a`) |
| **Commits** | see the PR's commit list (docs only) |
| **Pull request** | opened from this branch (link recorded in a follow-up commit) |
| **Status** | implemented; docs only; awaiting Codex review and the owner's merge |

## Objective
- Mark RO-003 through RO-007 `done` only where their completion criteria are met, whoever they are assigned to.
- Record the iPhone simulated-data warning-badge clipping under the next free ID, without fixing it.
- Update `PROJECT_STATUS.md` with the remaining Milestone 1 work.
- Assess open PRs #2, #6, #7, #8 and #9 without modifying them.
- Keep Milestone 2 (RO-012) paused.

## Evidence per task (checked 2026-10-23)

| Task | Completion criteria (`TASKS.md`) | Evidence | Result |
|---|---|---|---|
| RO-003 | PR merged; CI green; `npm run verify` passes (boundaries, typecheck, 46/46 tests); RO-007 passed; RO-006 approved | PR #3 merged as `cd884fc` (2026-10-17 UTC). CI: PR run 38933844181 on `6f48f1d`, `main` run 38986550607 on `cd884fc`. `npm run verify` at `cd884fc`, re-run today, exit 0: boundaries OK (58 files), checker 8/8, typecheck OK, Jest 48/48 (two more than 46: `2dae11b` added SQLite integration tests). RO-006 and RO-007 below | **done** |
| RO-004 | PR merged; CI green on `main`; `CLAUDE.md`/`GEMINI.md` load `AGENTS.md` | PR #1 merged as `75e2814` (2026-10-15). `main` run 38807737485 succeeded, and every later run too. `CLAUDE.md` has `@AGENTS.md`; `GEMINI.md` has `@./AGENTS.md` | **done**; follow-ups PR #2 and PR #7 stay open |
| RO-005 | PR open against `main` with the template; CI result reported; handoff added | PR #3 (base `main`) has the template's sections; CI was reported on it (e.g. run 38933844181); `docs/handoffs/2026-10-15-claude-RO-005.md` is on `main` | **done** |
| RO-006 | Written review on the PR with exact test output; blocking issues listed or approval given | PR #3 reviews (see list below) | **done** |
| RO-007 | Simulated set started, reps counted, stopped, set in History; result noted on the RO-005 PR | Owner comment 6227338609 on PR #3 (2026-10-16), also posted as 6227343084: iPhone, Expo Go; 8 full / 3 partial / 1,800 samples; saved; in History; still there after restart. Simulated data only | **done** |

PR #3 reviews behind RO-006:
- **5540804748** on `1ef8f6f`: changes requested, two P2s, with `npm ci`/test output.
- **5541144246**: approved `40d4a22`.
- **5551033324**: approved `6f48f1d`, with native-Windows results.

These are COMMENT reviews under the owner's account, which Codex used as its connected identity (GitHub doesn't let
the PR author approve). The Codex integration also reported "Didn't find any major issues" at `6f48f1d` (comment
6220324008).

Which commit RO-007 covers: the owner's comment names the branch, not a commit. The `apps/` tree (`a291187`) and the
`packages/` tree (`2fbbf1c`) are identical at `40d4a22`, `30e2dd3`, `6f48f1d` and `cd884fc`. So whichever head was
installed on 2026-10-16, the device check covers the merged app code.

## What changed
- **`TASKS.md`:**
  - RO-003…RO-007 → `done`, with merge commits or links in the PR column and a "Done" entry under each task's
    details.
  - RO-006 (Codex) and RO-007 (owner) were updated at the owner's explicit request ("regardless of original assignee").
  - New **RO-023**, "Simulated-data warning badge clips on iPhone (record only; not fixed yet)": Claude Code, P3, `todo`.
    It has a source, expected files, a likely cause marked unconfirmed, and completion criteria including the owner's
    device check.
  - Next free ID → **RO-024**. No other rows changed. RO-012 is unchanged (`todo`), and `PROJECT_STATUS.md` records it as
    paused.
- **`PROJECT_STATUS.md`:**
  - Now at `main` @ `9b8b81a`, with PR #12 in the merged table and RO-003…RO-007 done.
  - Verified evidence refreshed, and the RO-007 commit wording corrected: the previous version said the check ran
    "@ `6f48f1d`", which the comment does not state.
  - New **"Remaining Milestone 1 work"** table: RO-011/PR #8, RO-021/PR #9, RO-008, RO-010, RO-023, and the ADR 0004
    status.
  - Open-PR assessment with a recommended order; Next steps and change log.
- **`docs/handoffs/README.md`:** index entry for this handoff.
- **Not changed:** code, CI, ADRs, `AGENTS.md`, the open PRs, the archive tag and the preview branches.

## Open PRs (assessment only — not modified)
Details are in `PROJECT_STATUS.md` → "Open branches / PRs". None of them has a review or a comment.

| PR | Contributes | Still needed? | Merges with `main`? |
|---|---|---|---|
| #2 | Owner decision of 2026-10-15: agent-owned status PRs, ChatGPT roadmap-only; ADR 0004 → Accepted | Partly: the ADR status fix is needed; the rule needs an owner decision, since recent practice differs | No: conflicts in shared files |
| #6 | Rebrandable-naming rule (`AGENTS.md` §5) and ADR 0006 | Yes; its inventory still matches `main` | Yes |
| #7 | Antigravity and Lenovo onboarding (Codex) | Yes if Antigravity stays in use; stale against `main` (RO-019, RO-007, `verify`) | Yes (new files only) |
| #8 | RO-011 architecture review (Gemini) | Yes: RO-011's only deliverable; a dated review of `40d4a22` | Yes (new files only) |
| #9 | RO-021 record (task row and native-Windows evidence); the fix is already in `cd884fc` | Yes as the record; stale | No: `TASKS.md` conflicts |

Recommended order: this PR → owner decision on #2 → #9 (refresh, RO-021 `done`) → #8 → #6 → #7 (Codex refresh).

## Files changed
- `TASKS.md` — modified
- `PROJECT_STATUS.md` — modified
- `docs/handoffs/README.md` — modified (index)
- `docs/handoffs/2026-10-23-claude-RO-003-m1-closeout.md` — added

## Tests and checks (exact results)
Docs only. No code tests are required, but they were run anyway.

| Command | Result |
|---|---|
| `npm ci` (this branch, Node 22.22.0) | exit 0 |
| `npm run verify` (this branch) | exit 0. Boundaries OK (58 files, no circular imports); workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files); typecheck OK; Jest 48/48 (mobile 15, rep-engine 16, sensor-contracts 13, workout-domain 4) |
| `npm run test:scripts` (this branch) | exit 0. tests 62, pass 62, fail 0 |
| `npm ci` + `npm run verify` at `cd884fc` (Milestone 1 merge) | both exit 0. Boundaries OK (58 files); checker 8/8; typecheck OK; Jest 48/48 |
| Tree comparison `40d4a22`/`30e2dd3`/`6f48f1d`/`cd884fc` | `apps/` and `packages/` identical at all four |

Environment notes: Linux container. No device run is possible here; RO-023 needs the owner's iPhone.

## Decisions / ADRs
- none

## Known limitations / risks
- `TASKS.md` and `PROJECT_STATUS.md` will conflict with PR #2 and PR #9 (#9 already does).
- RO-023's cause is inferred from the code, not reproduced on a device.

## Next steps
1. **Codex:** review this PR (docs only). Check every claim against PR #3's reviews and comments, the CI runs and the
   tree hashes.
2. **Owner:** merge decision; then the open PRs in the recommended order, starting with a decision on PR #2.
3. **RO-023**, RO-008, RO-010 as Milestone 1 follow-ups. **RO-012 stays paused** until the owner's go-ahead.

## Questions for the owner
- PR #2: does the 2026-10-15 rule stand? This closeout and PR #12 were owner-directed exceptions to it.
- RO-023 priority: P3 follows your "minor, non-blocking" note. Raise it if the warning's legibility should come first.
