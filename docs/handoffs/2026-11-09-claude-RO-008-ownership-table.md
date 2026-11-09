# Handoff — RO-008: align the ownership table with `AGENTS.md` §2; correct the routes note (docs only)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-09 |
| **Task** | RO-008 (`TASKS.md`), assigned to Claude Code. Done while the owner's phone checks are deferred: it touches no file in the held PRs |
| **Branch** | `claude/RO-008-ownership-table` (base: `main` @ `9664fc5`) |
| **Commits** | see the pull request; final commit last |
| **Pull request** | the PR that adds this file |
| **Status** | implemented · verified (docs only) |

## Objective
`docs/architecture.md` §6 still followed the Sprint 1 brief's suggestion: Codex owned `packages/rep-engine/` and
Gemini owned `docs/`. Align it with the roles in `AGENTS.md` §2, where per-task ownership lives in `TASKS.md`. Also
state that the Expo Router routes live in `apps/mobile/app/`, as RO-011 finding 4 asked: `apps/mobile/AGENTS.md`
said `src/app/`.

## What changed
- **`docs/architecture.md` §6:**
  - The section points to `AGENTS.md` §2 for the roles and to `TASKS.md` ("Files") for per-task ownership, one agent
    per file at a time.
  - The table now lists:
    - contracts: shared, changed only through an ADR and with a Codex review, which keeps ADR 0007's reference to
      §6 valid;
    - implementation (`apps/mobile/`, `packages/`, `firmware/`): Claude Code, per task;
    - testing, debugging and review: Codex;
    - research and proposed ADRs: Gemini;
    - priorities and task proposals: ChatGPT;
    - approvals, merges and device testing: the owner.
  - The Sprint 1 suggestion is named as replaced.
- **`apps/mobile/AGENTS.md`, routes line:**
  - routes live in `apps/mobile/app/`, not the Expo template's `src/app/`;
  - non-route code stays in the `src/` layers;
  - `check:boundaries` treats `apps/mobile/app/` as the routes layer (`scripts/check-boundaries.mjs`, the `route`
    kind), so it must not be moved.
- **`TASKS.md`:** the RO-008 row is set to `in-review` with the PR link (`AGENTS.md` §3 step 7).

## Files changed
- `docs/architecture.md`: modified (§6 only)
- `apps/mobile/AGENTS.md`: modified (the routes line only)
- `TASKS.md`: modified (the RO-008 row only)
- `docs/handoffs/2026-11-09-claude-RO-008-ownership-table.md`: added; `docs/handoffs/README.md`: index row

## Tests and checks (exact results)
Docs only — no code tests required. No config changed.

| Command | Result |
|---|---|
| `npm run check:boundaries` | OK |
| `npm run check:workflows` | OK |
| Overlap check | none of PRs #28, #29, #30, #31, #35, #37 or #38 changes `docs/architecture.md` §6 or `apps/mobile/AGENTS.md`. #28 changes only §2's table, and #30 keeps the routes in `apps/mobile/app/` |

## Decisions / ADRs
None. The table restates `AGENTS.md` §2 and adds no new rule.

## Known limitations / risks
- `docs/agents/ANTIGRAVITY.md` step 3 says the mobile instruction's `src/app/` statement conflicts with the tree.
  After this PR it no longer does. That file is outside RO-008's listed files, so it is left for a follow-up.
- `PROJECT_STATUS.md` still lists RO-008 as `todo`. It is updated in a status PR after the merge (§3 step 9).

## Next steps
1. After the merge: a status update setting RO-008 to `done` with the merge commit.
2. A small follow-up, if the owner wants one: drop the now-resolved discrepancy note from
   `docs/agents/ANTIGRAVITY.md` step 3.

## Questions for the owner
None.
