# ADR 0006 — Rebrandable product identity

- **Date:** 2026-10-16
- **Status:** Accepted (owner directive, 2026-10-16) — rule recorded; existing UI strings centralised in a follow-up task
- **Numbering:** 0003 (`sprint-1-alignment`), 0005 (RO-019 branch) and 0004 (`main`) are taken; this is 0006.

## Context

"RepOne" is a temporary development name. The owner requires that the product can be renamed without touching
core functionality: user-facing names are centralised, branding is not hardcoded across the application, and
existing package identifiers and repository paths are **not** renamed until explicitly instructed.

Inventory of the name in code (excluding docs and tests), 2026-10-16, on `main` and the Milestone 1 branch:

| Kind | Occurrences | Rebrand impact |
|---|---|---|
| **User-facing display name** | `apps/mobile/app.json` `expo.name` ("RepOne", shown under the app icon); `apps/mobile/app/_layout.tsx` home screen title `'RepOne'` | Free to change — must come from one place |
| npm workspace scope | `@repone/*` package names and imports | Internal only; rename = mechanical refactor + lockfile |
| Expo `slug` / URL `scheme` | `repone` | `scheme` is used by deep links; changing it breaks existing links |
| Local database file | `repone.db` | Renaming without a migration loses users' local workouts |
| Document names / comments | `REPONE_SOURCE_OF_TRUTH.md` and references to it | Docs only |
| Unmerged branches | RO-019 marker `repone-ai-loop:v1` (PR #4); draft H0 header `# repone h0 v1` in `docs/hardware-protocol.md` (PR #3) | Wire/state formats — neutralise before they are used for real |

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
- The two existing user-facing strings are moved behind the brand configuration **after PR #3 merges**, to avoid
  invalidating its approved review and because the brand module belongs in PR #3's `src/shared/` layer.
