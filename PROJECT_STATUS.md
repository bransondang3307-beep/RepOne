# RepOne — Project Status

> **Rule:** "Verified on `main`" lists only work that is **merged into `main` and verified**, with the
> evidence. Unmerged work goes under "Open branches / PRs". Update this file in a PR only after the
> change it describes has merged (`AGENTS.md` §3 step 9). Status words: see `AGENTS.md` §4.

| | |
|---|---|
| **Last updated** | 2026-10-15 by Claude Code (RO-004) |
| **`main` at** | `d9a7274` — "Add Sprint 1 agent handoff document" |
| **CI on `main`** | Not yet configured on `main`; added by the RO-004 PR (`.github/workflows/ci.yml`) |
| **Current phase** | Sprint 1 — alignment with the full Sprint 1 brief (Milestones 1–5). Sprint 2 **not started**. |
| **Hardware** | No real sensor connected to the software yet (source of truth §2). All rep data is simulated. |

## Verified on `main`

Evidence: fresh clone of `main` @ `d9a7274`, `npm ci`, executed 2026-10-15 (RO-004 session):
`npm run typecheck` exit 0; `npm test` → `packages/core` **45/45 passed**, `apps/mobile` **1/1 passed**.

| Feature | Location on `main` | Verified by |
|---|---|---|
| Sensor abstraction (`SensorSource`) with simulated + replay sources | `packages/core/src/sensors/` | Shared contract tests |
| Seeded synthetic motion + labelled traces | `packages/core/src/simulation/` | `simulation.test.ts` |
| Rotational rep detector (FSM), full/partial classification | `packages/core/src/processing/` | `rotationalRepDetector.test.ts` — **synthetic data only** |
| Rep evaluation (precision/recall/failure lists) | `packages/core/src/evaluation/` | `evaluateReps.test.ts` |
| Repository interfaces; in-memory + SQLite implementations; migrations | `packages/core/src/persistence/` | `repositories.test.ts` (SQLite via `node:sqlite`) |
| Session orchestration (sensor → storage → detector) | `packages/core/src/session/` | `workoutSessionController.test.ts` |
| Expo app: simulated set screen + history, Zustand store, expo-sqlite adapter | `apps/mobile/` | Typecheck + store test; Android JS bundle built at `1b7e5b9` |
| ADR 0001 (stack/layout), ADR 0002 (sensor contract/detector), Sprint 1 handoff | `docs/` | Docs |

**Implemented but not verified:** app has never been run in Expo Go / on a device; expo-sqlite adapter
not exercised on a device.

## Open branches / PRs (not merged — not counted as done)

| Branch | Task | State | Evidence so far |
|---|---|---|---|
| `sprint-1-alignment` @ `6e79ee3` | RO-003 Milestone 1: split into `sensor-contracts` / `rep-engine` / `workout-domain`, app `features/ shared/ infrastructure/ application/`, boundary checker, `docs/architecture.md`, `docs/hardware-protocol.md`, ADR 0003 | Pushed; **no PR yet** | In-session 2026-10-15: `npm run verify` → boundaries OK, typecheck clean, 46/46 tests; Android + iOS export OK; dev server served bundle. Expo Go not yet tested. |
| `claude/RO-004-agent-sync` | RO-004 multi-agent sync setup (this file, `TASKS.md`, `CLAUDE.md`, `GEMINI.md`, handoff system, CI) | PR open (see `TASKS.md`) | See its handoff |

## Active milestone

**Sprint 1 alignment — Milestone 1** (RO-003): implemented on branch, awaiting PR (RO-005),
Codex review (RO-006) and Expo Go check by the owner (RO-007). Milestones 2–5 (RO-012…RO-015)
wait for RO-003 to merge and the owner's go-ahead.

## Blockers

| Blocker | Blocks | Owner |
|---|---|---|
| Expo Go run needs the owner's phone (cloud sessions cannot run Expo Go) | RO-003 acceptance, RO-007 | Owner |
| Branch protection unavailable (private repo on GitHub Free) — "PR + review before merge" is a process rule, not enforced | Workflow enforcement | Owner (optional: GitHub Pro or public repo) |
| No real sensor data yet | Any accuracy claim; detector tuning | Owner (hardware, source of truth §11) |

## Next steps (priority order — details in `TASKS.md`)

1. Review and merge the RO-004 PR (sync setup + CI).
2. RO-005: open the PR for `sprint-1-alignment`; RO-006 Codex review; RO-007 owner Expo Go test.
3. RO-011 Gemini architecture review of the Milestone 1 layout; RO-016 Gemini H0 serial-schema research.
4. After RO-003 merges: RO-008 ownership table update, then Milestone 2 (RO-012) on owner approval.

## Known limitations (carried forward)

- Detector thresholds are unvalidated hypotheses; rotational machines only; drift with uncorrected bias.
- Expo online API blocked in cloud sessions: dependencies installed with SDK-matched offline versions; `expo-doctor`/`expo lint` not run.
- No project license chosen (RO-009). No ESLint config (RO-017).

## Status change log

| Date | Change | By |
|---|---|---|
| 2026-10-15 | File created; reflects `main` @ `d9a7274` | Claude Code (RO-004) |
