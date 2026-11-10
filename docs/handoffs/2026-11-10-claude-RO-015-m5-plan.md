# Handoff — RO-015: Milestone 5 plan (integration and Sprint 1 close-out), proposed

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-10 |
| **Task** | RO-015 (`TASKS.md`), plan only. Milestone 5 is not started |
| **Branch** | `claude/RO-015-m5-plan` (base: `main` @ `4986606`) |
| **Pull request** | the PR that adds this file |
| **Status** | proposed. Docs only; needs the owner's review of §5 |

## Objective
Prepare Milestone 5 while Milestones 3 and 4 wait for the owner's phone checks. The owner said "keep going on the
milestones". This PR makes no code changes and starts nothing.

## What changed
- **`docs/plans/RO-015-milestone-5-plan.md`:**
  - scope from `TASKS.md`, and a three-PR delivery;
  - a full-run dry run on the Milestone 4 candidate `4c6eee7`;
  - a docs audit of ten stale statements, with line numbers;
  - five owner decisions, recommendations first;
  - the prompt for Codex's independent review.
- **`TASKS.md`:** the RO-015 row links the proposed plan; its status stays `todo`.

## Tests and checks (exact results)
Docs only — no code tests required. The plan's §3 dry run was executed in this session on `4c6eee7` (clean
`npm ci`, Node 22.22.0):

| Command | Result |
|---|---|
| `npm run verify` | exit 0. Jest: mobile 173, rep-engine 27, sensor-contracts 103, sensor-protocol 76, workout-domain 38; script tests 124 |
| `npm run test:firmware` | 62/62, 16/16, 9/9 |
| `expo export` Android / iOS | exit 0 / exit 0 |
| `expo-doctor` | 18/20. 2 need network that this environment cannot reach |
| `npm audit --omit=dev` | 8 moderate / 0 high (candidate), against 13 / 5 high (`main`) |
| `check:boundaries`, `check:workflows` on this branch | OK |

## Decisions / ADRs
None taken. Five are proposed for the owner (plan §5).

## Known limitations / risks
- The audit rows reflect the code at the Milestone 4 candidate. PR 5.1 rechecks them on `main` after the merges.
- `expo-doctor`'s two network checks must be rerun outside this environment.

## Next steps
1. **Owner:**
   1. the phone checks (redesign `4f847cf`, upgrade `da4493b`, optionally Milestone 4 `4c6eee7`);
   2. then the plan §5 decisions and the Milestone 5 go-ahead.
2. **Claude Code, after the Milestone 4 merges:** PR 5.1.
3. **Owner:** start Codex's review (PR 5.2) with plan §6's prompt.

## Questions for the owner
The five decisions in plan §5. None of them blocks work before the Milestone 4 merges.
