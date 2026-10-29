# ADR 0006 — Rebrandable product identity

- **Date:** 2026-10-16
- **Status:** Accepted (owner directive, 2026-10-16). The rule is recorded here; the existing UI strings are centralised
  by the follow-up task **RO-024** (recorded 2026-10-28).
- **Numbering:** 0001–0005 are on `main`, and 0007 is used by RO-012's open PR #14 (Proposed); this is 0006.

## Context

"RepOne" is a temporary development name. The owner requires that the product can be renamed without touching
core functionality: user-facing names are centralised, branding is not hardcoded across the application, and
existing package identifiers and repository paths are **not** renamed until explicitly instructed.

Inventory of the name in code (excluding docs and tests), taken 2026-10-16 and re-checked 2026-10-28 on `main` @
`4951a37`. It is unchanged; the paused RO-012 PRs (#14–#17) add no occurrences, and their new identifiers are neutral
(for example `simulated-device-01`).

| Kind | Occurrences | Rebrand impact |
|---|---|---|
| **User-facing display name** | `apps/mobile/app.json` `expo.name` ("RepOne", shown under the app icon); `apps/mobile/app/_layout.tsx` home screen title `'RepOne'` | Free to change — must come from one place |
| npm workspace scope | `@repone/*` package names and imports | Internal only; rename = mechanical refactor + lockfile |
| Expo `slug` / URL `scheme` | `repone` | `scheme` is used by deep links; changing it breaks existing links |
| Local database file | `repone.db` | Renaming without a migration loses users' local workouts |
| Document names / comments | `REPONE_SOURCE_OF_TRUTH.md` and references to it | Docs only |
| Draft wire format | H0 header `# repone h0 v1` in `docs/hardware-protocol.md` (on `main` since PR #3; a draft, not implemented) | Neutralise before it is used for real: RO-016 (H0 serial schema) |
| Archived branch | RO-019 marker `repone-ai-loop:v1` on `claude/RO-019-claude-codex-loop` (PR #4, closed unmerged; ADR 0005) | None while archived; not on `main` |

Core packages contain no user-facing branding; domain types and services already use generic names
(`WorkoutSessionController`, `RotationalRepDetector`, `SensorSource`).

## Decision

1. **Three categories, three rules.**
   - *Display branding* (product name, short name, tagline, support/website text, logo and icon assets): defined in
     **one brand configuration** owned by the app and read everywhere else. No literal product name in UI code.
   - *Technical identifiers* (package scope, repository and paths, slug, URL scheme, bundle ID / application ID,
     database file, storage keys): **existing ones stay unchanged** until the owner instructs a rename. New ones are
     named neutrally (e.g. `workouts.db`, `settings.v1`), not after the product.
   - *Core functionality* (packages, domain logic, contracts, algorithms, firmware logic, tests): **brand-free**.
     They never import the brand configuration and never contain the product name in behaviour, user-visible
     strings or new identifiers.
2. **Location.** The brand configuration lives in the mobile app's shared layer (planned:
   `apps/mobile/src/shared/brand.ts`, data-only, no React Native imports) and is exported through
   `src/shared/index.ts`. Expo's `app.json` becomes `app.config.ts` so the installed app's display name is read from
   the same source; `slug`, `scheme` and future bundle identifiers stay as they are. If a second app appears, the
   data moves to a tiny data-only workspace package.
3. **Wire formats and devices.** Protocol headers, BLE advertised names and GATT service/characteristic UUIDs,
   analytics/event names and log prefixes must not depend on the product name. Device discovery matches neutral
   service UUIDs, never a name string. The advertised device name is a firmware configuration constant.
4. **Guard.** The follow-up task adds a test that fails when a user-facing source file contains the product name
   outside the brand configuration, so regressions are caught in CI.
5. **Renaming later** (only when instructed) is a planned change with its own ADR: update the brand configuration
   (display rename, no code changes elsewhere), then — separately and only if requested — identifiers, with a
   migration for the database file and a deep-link transition for the URL scheme.

## Consequences

- A display rename becomes a one-file change plus assets.
- Identifier renames remain possible but deliberate, because some (scheme, database file, store identifiers) affect
  installed users.
- Agents follow the rule via `AGENTS.md` §5 (loaded by `CLAUDE.md` and `GEMINI.md`, referenced by ChatGPT's instructions).
- The two existing user-facing strings are moved behind the brand configuration by **RO-024**. That was deferred
  until PR #3 merged, to avoid invalidating its approved review, and because the brand module belongs in PR #3's
  `src/shared/` layer. PR #3 merged on 2026-10-17 (`cd884fc`).

## Follow-up (recorded 2026-10-28, owner-directed)

**RO-024 — Brand configuration for display names** (Claude Code, P2, code). It implements Decisions 2 and 4:
- `apps/mobile/src/shared/brand.ts`, data-only, exported from `src/shared/index.ts`;
- `app.json` → `app.config.ts`, reading the display name from it. `slug`, `scheme` and the database file are
  unchanged;
- the home-screen title read from it;
- a guard test that fails when user-facing source contains the product name outside the brand configuration.

It is not started here. The draft H0 header is RO-016's concern (Decision 3).
