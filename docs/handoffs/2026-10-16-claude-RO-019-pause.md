# Handoff — RO-019 paused: record pause, open concerns and resume condition

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-16 |
| **Task** | RO-019 (owner decision: pause to prioritise the core prototype) |
| **Branch** | `claude/RO-019-pause` (base: `main` @ `75e2814`) |
| **Commits** | see the PR commit list |
| **Pull request** | docs-only PR to `main` (link in the PR conversation); **not merged** |
| **Status** | implemented (tracking docs only) |

## Objective
Pause RO-019 without losing it: keep PR #4 intact and disabled, record the project as PAUSED with its
outstanding review concerns and an exact resume condition, and return focus to the core prototype.

## What changed
- `TASKS.md`: RO-019 row added as `blocked` — **PAUSED (awaiting core prototype milestone)**, linking open PR #4
  ("do not merge"); details section with what is preserved, rules while paused, the three outstanding review
  concerns, the resume condition, and the procedure for flagging "READY TO RESUME". Next free ID → RO-020.
- `PROJECT_STATUS.md`: PR #4 listed under "Open branches / PRs" as PAUSED; new "Paused work" section with the
  resume condition; change-log row. Other stale rows (RO-004 era) intentionally not refreshed — that belongs to the
  pending RO-004 status-update PR.
- This handoff.
- **Not changed:** PR #4 branch and its code/tests/docs (untouched at `af8acd9`), application code, workflows,
  `AGENTS.md`, `CLAUDE.md`. No secrets configured; `AI_LOOP_MODE` remains unset; nothing merged.

## Files changed
- Modified: `TASKS.md`, `PROJECT_STATUS.md`
- Added: `docs/handoffs/2026-10-16-claude-RO-019-pause.md`

## Tests and checks
| Command | Result |
|---|---|
| Docs-only change | no code tests required (AGENTS.md §3 step 5); CI runs on the PR |
| `git merge-tree` against open PR #2, #3, #4 branches | see PR description |

## Resume condition (exact)
Resume RO-019 when RepOne's hardware sensor successfully sends real movement data to the mobile app and the app
demonstrates working repetition counting. When met, the agent whose merged work achieves it flags RO-019
"READY TO RESUME" in `TASKS.md` (own status-update PR) and lists it in that handoff's Next steps.

## Outstanding RO-019 blockers (recorded in `TASKS.md` → RO-019)
1. CI success must be verified on the exact head SHA (separate review vs CI status; failed/skipped/missing/delayed
   CI never counts as success; stop for a human otherwise).
2. Manual override (`force=true`) and API cost safeguards need review.
3. GitHub comment-based state tracking needs robustness testing (edited/malformed/duplicated/reordered comments;
   fix-round cap).

## Core prototype status and next steps
- **PR #3 (RO-003/RO-005, Milestone 1 restructure):** Codex RO-006 re-review on `40d4a22` = **APPROVED** (both
  findings fixed, no new blocking issues; 48/48 Jest + 7/7 checker tests reproduced). Only the owner's **Expo Go
  check (RO-007)** remains before the owner merges it.
1. **Owner — RO-007:** run `sprint-1-alignment` in Expo Go; if it works, merge PR #3 (all further core work builds
   on that layout).
2. **Owner — RO-018 (in parallel):** H0 bring-up — Uno R3 + GY-521, I²C scan, stream timestamped raw IMU
   (source of truth H0-A exit gate).
3. **Claude Code — after PR #3 merges:** RO-012 (device-connectivity interface, sensor error states, multi-channel
   wrapper — no rep-algorithm change), designed against the real transport.

## Questions for the owner
- The resume milestone needs real sensor data *in the phone app*, but H0 is a wired USB board on a computer. No task
  yet covers that path. Choose for the prototype: (a) a development bridge (computer reads USB serial and relays to
  the app over the local network) using H0 hardware you own, or (b) BLE with the H1 board (XIAO nRF52840, not yet
  purchased). ChatGPT can then add the tasks (proposed: H0 firmware sketch + serial schema decision RO-016; serial
  capture/replay; app `SensorSource` for the chosen transport; on-device demo).
