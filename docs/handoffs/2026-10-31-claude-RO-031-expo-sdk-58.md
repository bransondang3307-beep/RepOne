# Handoff — RO-031: upgrade the app to Expo SDK 58

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-31 |
| **Task** | RO-031 (`TASKS.md`) |
| **Branch** | `claude/RO-031-expo-sdk-58` (base: `main` @ `b414307`) |
| **Commits** | see the PR: one dependency commit, then this docs commit |
| **Pull request** | not opened yet: `gh` is not installed on this machine, so the owner opens it from the compare link |
| **Status** | implemented and verified by checks and Expo export; the device check is pending |

## Objective
The owner: "we have to be on SDK 58.0.0". The App Store's Expo Go runs only the newest SDK, which is now 58 (npm
`latest` = `expo` 58.0.21, published 2026-10-28). An SDK 57 project therefore no longer opens in Expo Go on the
owner's iPhone.

## What changed
**Expo's upgrade path.** In `apps/mobile`, I ran `npx expo install expo@^58.0.0`, then `npx expo install --fix`, which
moves every SDK-managed package to the version SDK 58 expects. Then I narrowed `expo` to `~58.0.21`, the same
tilde style as the old `~57.0.31`.

| Package | SDK 57 (`main`) | SDK 58 |
|---|---|---|
| `expo` | ~57.0.31 | ~58.0.21 |
| `expo-router` | ~57.0.29 | ~58.0.28 |
| `expo-constants` / `expo-linking` / `expo-sqlite` / `expo-status-bar` | 57.x | ~58.0.14 / ~58.0.15 / ~58.0.14 / ~58.0.4 |
| `react-native` | 0.86.3 | 0.88.1 |
| `react` | 19.2.3 | 19.3.0 |
| `react-native-safe-area-context` / `react-native-screens` | ~5.7.0 / ~4.26.0 | ~5.10.1 / ~4.30.0 |
| `jest-expo` / `jest` / `@types/jest` (mobile only) | ~57.0.6 / ^29.7.0 / ^29.5.14 | ~58.0.13 / ~30.5.2 / 30.0.0 |
| `@types/react` | ~19.2.2 | ~19.3.0 |

- **`app.json`.** The SDK 58 installer added `"expo-status-bar"` to `plugins`.
- **One React (root `package.json` `overrides`).** After the upgrade, `expo-doctor` failed its duplicate-dependency
  check. The app pins React 19.3.0, but other packages pulled 19.3.1 to the root, so two Reacts were installed;
  `main` already had the same problem with 19.2.3 and 19.3.1.
  - `"overrides": { "react": "19.3.0" }` makes npm install one React. `npm dedupe` then merged the same-version
    copies of `expo-constants`, `@expo/log-box` and `@expo/dom-webview`.
  - **The override must be bumped with each future SDK upgrade,** to the React version that SDK pins.
- **The `packages/*` workspaces are unchanged.** They stay on their own Jest 29 + ts-jest setup; only the app moved to
  Jest 30, which `jest-expo` 58 requires.
- **No application code changed.**

## Files changed
- `apps/mobile/package.json`, `apps/mobile/app.json`, `package.json`, `package-lock.json` — modified
- `TASKS.md` — the RO-031 row and details (next free ID RO-032)
- `docs/handoffs/2026-10-31-claude-RO-031-expo-sdk-58.md` — added; `docs/handoffs/README.md` — modified

## Tests and checks (exact results)
All run after a clean `npm ci` from the committed lockfile, on Windows 11, Node v24.22.0, npm 11.19.1.

| Command | Result |
|---|---|
| `npm run verify` | **exit 0**:<br>• `✓ module boundaries OK (74 files checked, no circular imports)`<br>• `✓ workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files …)`<br>• typecheck OK in all four workspaces<br>• script tests 62/62<br>• Jest 165/165: mobile 31, rep-engine 27, sensor-contracts 103, workout-domain 4 |
| `npx expo install --check` | `Dependencies are up to date` |
| `npx expo-doctor` | `20/20 checks passed. No issues detected!` Before the React override: 19/20, failing on duplicate dependencies |
| `npx expo export --platform ios --platform android` | exit 0; iOS and Android bundles 2.7 MB each |
| `npm audit` | 34 (2 low, 30 moderate, 2 high), down from 39 (5 low, 29 moderate, 5 high) on SDK 57. The 39 was measured on RO-030's branch, `main` plus `react-native-svg`; svg adds no advisory |

Not run: a device check (the owner's phone).

## Decisions / ADRs
- No new ADR: this is a version upgrade within the same stack.
- ADR 0001 still says "Expo SDK 57 app". It is a dated record of the stack choice and isn't edited here; the stack
  itself (Expo, Expo Router, expo-sqlite, Zustand) is unchanged.

## Known limitations / risks
- **Not yet run on a device.** React Native 0.86 → 0.88 is two minor versions. The tests and the bundle build pass,
  but runtime behaviour needs the owner's Expo Go check.
- **The React override must track the SDK** (above).
- **Merge overlap:**
  - RO-029's open branches also change `package-lock.json`. Whichever merges second runs `npm install` to rebuild the
    lockfile.
  - RO-030 (UI redesign) has RO-031 merged in on its branch. If RO-031 merges first, RO-030's PR shows only the
    redesign.

## Owner's Expo Go check (iPhone, current App Store Expo Go)
Run `npm ci`, then `cd apps/mobile && npx expo start`, and scan the QR code.

1. The app opens; no "incompatible SDK" message.
2. Connect the simulated device, start a simulated set, see reps count, stop it. The set appears in History.
3. Simulate connection loss mid-set: the set ends with the existing error message.
4. Force-quit and reopen: the set is still in History.

If RO-030 is checked on its branch, which includes this upgrade, its checklist covers these steps too.

## Next steps
1. Owner: open the PR:
   `https://github.com/bransondang3307-beep/RepOne/compare/main...claude/RO-031-expo-sdk-58`.
2. After Codex's review and the device check, merge RO-031 before RO-030.

## Questions for the owner
- none
