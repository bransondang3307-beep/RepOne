# Handoff — RO-025: boundary-checker hardening (per-adapter infrastructure layers)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-31 |
| **Task** | RO-025 (`TASKS.md`) |
| **Branch** | `claude/RO-025-boundary-hardening` (base: `main` @ `f1df6b2`) |
| **Commits** | see the PR |
| **Pull request** | [PR #25](https://github.com/bransondang3307-beep/RepOne/pull/25) |
| **Status** | implemented · verified (tests run in this session) |

## Objective
RO-011 finding 2 found two gaps:
- the boundary checker treated all of `apps/mobile/src/infrastructure/` as one layer, so one adapter could import
  another adapter's internals;
- `application/` could import an adapter's internal files instead of its `index.ts`.

`TASKS.md` requires the fix before a second infrastructure adapter lands. RO-029's BLE adapter will be that second
adapter (owner direction, 2026-10-31), so this lands first.

## What changed
- **`scripts/check-boundaries.mjs`:**
  - `layerOf()` returns `{ kind: 'infrastructure', name: <adapter> }` for `infrastructure/<adapter>/…`. The existing
    same-layer check now lets an adapter use only its own files.
  - A file directly under `infrastructure/` stays in the infrastructure layer, with an empty name.
  - `application/` (the composition root and providers) may import infrastructure only through
    `infrastructure/<adapter>/index.ts`. The existing `isLayerIndex()` already recognises those index files.
  - Every other rule is unchanged. Tests may still reach into what they exercise.
- **`scripts/check-boundaries.test.mjs`:** three regression tests:
  - a clean two-adapter workspace passes: own files, index imports, and a test reaching into another adapter;
  - both violations are reported;
  - both are still reported under the Windows-path simulation, with forward-slash diagnostics.
- **`docs/architecture.md` §3:** the `application` and `infrastructure/<x>` rows state the new rules.
- **`TASKS.md`:** RO-025's row is set to `in-review`.

## Files changed
- `scripts/check-boundaries.mjs`, `scripts/check-boundaries.test.mjs` — modified
- `docs/architecture.md`, `TASKS.md` — modified (RO-025 row only)
- `docs/handoffs/2026-10-31-claude-RO-025-boundary-hardening.md` — added

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `node --test scripts/check-boundaries.test.mjs` with the fix | 11/11 pass |
| The same tests against the old checker (negative control) | 2 of the 3 new tests fail, as expected. The third (the allowed case) passes on both |
| `npm run verify` (Node 22.22.0) | exit 0. Boundaries OK (74 files, the real repository passes); workflow policy OK; typecheck OK; script tests **65/65**; Jest 165/165 |

The Windows CI job runs the same script tests natively on Windows.

## Decisions / ADRs
- none (it enforces the existing layering in `docs/architecture.md`)

## Known limitations / risks
- `application/services` still may not import infrastructure at all. That is unchanged and stricter than this rule.

## Next steps
- RO-029 part 3 adds `infrastructure/bluetooth/`. It must pass these rules: the composition root imports it through
  its index, and it does not touch `infrastructure/database/`.
