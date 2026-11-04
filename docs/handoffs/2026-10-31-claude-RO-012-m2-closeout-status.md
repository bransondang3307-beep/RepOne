# Handoff — RO-012 / RO-023 / RO-027: Milestone 2 closeout status, RO-013 plan, RO-028 and RO-029 recorded

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-31 |
| **Task** | RO-012, RO-023 and RO-027 (status); RO-013 (plan only); RO-028 and RO-029 (recorded) |
| **Branch** | `claude/RO-012-m2-closeout-status` (base: `main` @ `f1df6b2`) |
| **Commits** | see the PR; docs only |
| **Pull request** | the status-update PR for this branch |
| **Status** | verified (docs only; `npm run verify` passed on the branch) |

## Objective
The owner directed this batch:
- finish PRs #20 and #21;
- run one combined device acceptance;
- merge Milestone 2 in order;
- record the results;
- write the Milestone 3 plan as a repository document, without implementing it.

On 2026-10-31 the owner also assigned the real-sensor BLE pipeline as the priority. This PR records that
assignment as RO-029.

## What changed
- **Merges, all owner-authorised.** Each was pinned to a head with a clean Codex review and green CI, and followed
  by a passing `main` CI run before the next:

  | PR | Head reviewed | Merge commit | `main` CI |
  |---|---|---|---|
  | #21 (RO-027) | `75dcf5a` | `4d6ce0c1ddc5200a3683f07efa4e816f3dd60994` | 41147866259 ✅ |
  | #14 (RO-012 part 1) | `44ed65e` | `9a42cf096b9632b0a14f0b8511a99154109ec5e0` | 41148049113 ✅ |
  | #15 (part 2) | `c79a42d` | `9b93b32f62fde0b1782724fe79b1740ffbced2d7` | 41148218361 ✅ |
  | #16 (part 3) | `3d15246` | `058bfe4f2bdb865098da3758fc646a2afd3d3338` | 41148386831 ✅ |
  | #17 (part 4 + RO-023) | `cb0e025` | `f1df6b2e7ae96abc9a1ea13b1f1639ace5768ac1` | 41148527229 ✅ |

  Earlier in the batch, PR #20 merged as `b477c71` (`main` CI 40826334604 ✅).
- **The refresh.** Before the merges, each Milestone 2 PR was refreshed against `main` @ `b477c71` with one merge
  commit (no force-push). The refresh changed records only. Codex re-reviewed each new head with no major issues.
- **Device acceptance.** Integration candidate `fe41d47` merged #17's head with #21's head.
  - The owner ran it in Expo Go on an iPhone on 2026-10-30, and all seven checklist steps passed.
  - Replaying the merge order on `b477c71` produced a tree identical to the candidate. After the real merges, `main`'s
    code and lockfile equal the candidate.
  - The owner first returned the checklist unfilled. That was not counted as a pass, and nothing merged until the
    owner had actually run the app and reported the results.
- **`TASKS.md`:**
  - RO-012, RO-023 and RO-027 set to `done`, with evidence; the RO-027 row added.
  - RO-028 (the iOS title-bar overlap) and RO-029 (the BLE pipeline, owner-directed, P1, `in-progress`) recorded.
  - RO-013 links its plan; RO-025's timing is updated (it lands before RO-029's adapter).
  - Next free ID: **RO-030**.
- **`PROJECT_STATUS.md`:** refreshed against `main` @ `f1df6b2`. The snapshot, merges, evidence, features, follow-ups,
  open branches, milestone, blockers and next steps are updated.
- **ADR 0007:**
  - Status set to **Accepted**, citing the owner's words of 2026-10-30.
  - Its stale references fixed: PR #6 and PR #8 are merged, and the Expo Go check is done.
  - No decision text changed.
- **`docs/plans/RO-013-milestone-3-plan.md` (new):**
  - Milestone 3's scope, design, and two-PR delivery.
  - The **six owner decisions**, with recommendations.
  - Ten **migration acceptance criteria**.
  - Risks.

## Files changed
- `TASKS.md`, `PROJECT_STATUS.md` — modified
- `docs/decisions/0007-sensor-errors-channels-device-connections.md` — modified (status and stale references)
- `docs/plans/RO-013-milestone-3-plan.md` — added
- `docs/handoffs/2026-10-31-claude-RO-012-m2-closeout-status.md` — added

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm ci`, then `npm run verify`, on this branch (`main` @ `f1df6b2` + docs), Node 22.22.0 | exit 0. Boundaries OK (74 files); workflow policy OK; typecheck OK; script tests 62/62; Jest 165/165 (mobile 31, rep-engine 27, sensor-contracts 103, workout-domain 4) |
| `git diff fe41d47 origin/main -- apps packages scripts .github/workflows package.json package-lock.json` | empty |

Docs only; no code changed.

## Decisions / ADRs
- ADR 0007 is Accepted (owner, 2026-10-30).
- The RO-013 plan contains proposals only. Its six decisions are the owner's.

## Known limitations / risks
- **PR #22** is a duplicate of PR #21, opened 2026-10-29 from another session on `claude/RO-025-dependency-security`.
  It is superseded, and its task ID collides with RO-025. Left open for the owner to close; not merged.
- **RO-028.** The owner's screenshot shows the home content under the translucent iOS title bar. The fix is a
  separate small PR with its own device check.
- **RO-016 overlap.** No RO-016 research exists. RO-029 will propose the wire protocol, so RO-016 needs re-scoping
  (owner or ChatGPT).
- **Owner manual items:** delete `claude/RO-012-integration-candidate`; the other items are in `PROJECT_STATUS.md`.

## Next steps
1. **RO-029:** protocol and codec PR, firmware PR, the RO-025 PR, then the BLE adapter PR. All are reviewable PRs, and
   the owner merges.
2. **RO-028:** the fix PR, then the owner's iPhone check.
3. **Owner decisions:** RO-013's six decisions; RO-016's re-scope; closing PR #22.
