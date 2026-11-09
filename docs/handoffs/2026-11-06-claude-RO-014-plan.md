# Handoff — RO-014 plan and hardware-dependent acceptance tests (docs only)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-06 |
| **Task** | RO-014 (planning only); owner direction of 2026-11-06, priorities 3 and 5 |
| **Branch** | `claude/RO-014-plan-hw-acceptance` (base: `main` @ `b414307`) |
| **Commits** | in the PR |
| **Pull request** | see the PR that adds this file |
| **Status** | proposed (plan); docs only |

## Objective
Two documents, while the hardware is away:
- plan Milestone 4 on top of PR #30's redesign and Milestone 3;
- write every hardware-dependent validation down as an explicit future acceptance test.

## What changed
- `docs/plans/RO-014-milestone-4-plan.md`:
  - scope: exercise selection, the workout flow, resistance entry ("entered", prefilled from history), dashboard
    and History;
  - architecture: a new `WorkoutController` application service on top of the unchanged `WorkoutSessionController`
    and the Milestone 3 repositories;
  - three PRs;
  - an owner acceptance checklist;
  - four owner decisions;
  - start conditions: PRs #29, #30, #33 and Milestone 3 part 2 merged.
- `docs/acceptance/hardware-acceptance-tests.md`:
  - H0 bring-up (HW-01–05);
  - bench rep detection against the PR #31 protocol (HW-10–16);
  - BLE (HW-20–24, referencing RO-029's stages B and C);
  - phone checks (APP-01 database upgrade, APP-02 Milestone 4);
  - the integration still needed.
  - None of it has been run.
- `TASKS.md`: the RO-014 row (dependencies, plan link) and section.

## Files changed
- `docs/plans/RO-014-milestone-4-plan.md`, `docs/acceptance/hardware-acceptance-tests.md` — added
- `TASKS.md` — RO-014 row and section
- `docs/handoffs/2026-11-06-claude-RO-014-plan.md`, `docs/handoffs/README.md` — added / index

## Tests and checks (exact results)
Docs only, so no code tests are required. `npm run verify` was not needed: no code or config changed.

## Decisions / ADRs
- None. The plan's §5 lists four owner decisions for when Milestone 4 starts.

## Known limitations / risks
- The plan assumes PR #30's components as they are on its branch today; it may need adjusting if PR #30 changes
  before merge.

## Next steps
1. **Owner:** answer the plan's §5 when Milestone 4 is due.
2. **Follow-up tasks (proposed):**
   - export a recording to `rep-trial-v1`;
   - call the detector's `finish()` at set end.

## Questions for the owner
- The four decisions in the RO-014 plan, §5.
