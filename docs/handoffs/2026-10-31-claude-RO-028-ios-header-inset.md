# Handoff — RO-028: iOS content starts under the translucent title bar

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-31 |
| **Task** | RO-028 (`TASKS.md`; the row is added by the Milestone 2 closeout status PR #23) |
| **Branch** | `claude/RO-028-ios-header-inset` (base: `main` @ `f1df6b2`) |
| **Commits** | see the PR |
| **Pull request** | see the PR |
| **Status** | implemented and tested in Jest; **not yet checked on the iPhone** |

## Objective
During the 2026-10-30 device check, the owner reported that the top of the home screen goes off screen. The owner's
screenshot shows the sensor panel behind the status bar and the frosted "RepOne" title bar. The owner asked to bring
the UI down below it.

## What changed
- **Cause.** On the owner's iPhone, the screen is laid out under the translucent title bar. The home `ScrollView`
  and the History `FlatList` did not adjust their content inset, so their content started at the very top of the
  display. The layout predates RO-012.
- **Fix.** Both scroll containers now set `contentInsetAdjustmentBehavior="automatic"`.
  - iOS then insets the content below the title bar and the status bar.
  - Where the bar is opaque, the scroll view is already below it and nothing changes.
  - Android ignores the prop.
  - No other layout, style or behaviour changed.
- **Regression test.** `apps/mobile/src/__tests__/routeScrollInsets.test.tsx` renders both routes, with their
  features mocked, and asserts the prop. Without the fix, both tests fail (checked).
- **Test infrastructure.** `apps/mobile/package.json`'s Jest config maps `react` to the app's own copy.
  - The workspace has two Reacts: 19.2.3 in `apps/mobile`, pinned by Expo SDK 57, and 19.3.1 hoisted to the root
    for `expo-router` and `expo-linking`.
  - `react-test-renderer` 19.2.3 resolved the root copy, so any route using hooks failed to render in Jest ("Cannot
    read properties of null (reading 'useState')").
  - The mapping makes tests use the React the app ships with. All existing tests still pass.

## Files changed
- `apps/mobile/app/index.tsx`, `apps/mobile/app/history.tsx` — modified
- `apps/mobile/src/__tests__/routeScrollInsets.test.tsx` — added
- `apps/mobile/package.json` — Jest `moduleNameMapper` (test only)
- `docs/handoffs/2026-10-31-claude-RO-028-ios-header-inset.md` — added

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm run verify` (Node 22.22.0) | exit 0. Boundaries OK (75 files); workflow policy OK; typecheck OK; script tests 62/62; Jest **167/167** (mobile 33, rep-engine 27, sensor-contracts 103, workout-domain 4) |
| New test without the fix (negative control) | 2/2 fail ("Expected: "automatic", Received: undefined") |
| `npx expo export --platform ios` / `--platform android` | both exit 0 |

The iPhone check has **not** run. Jest has no native layout, so only the owner's device can confirm the visual result.

## Decisions / ADRs
- none

## Known limitations / risks
- **Duplicate React.** The two React copies also exist in the app's dependency tree. Metro bundles a working app on
  the device (2026-10-30 check), so this is a Jest-only fix. Deduplicating the tree is a separate dependency task, if
  wanted.
- **Forward-compatible with RO-029.** The route test also mocks `useDeviceConnection` and `startSet`, which the home
  screen uses once PR #28 lands. Either merge order keeps the test valid (round 1, 2026-10-31).
- **Not added to `TASKS.md`.** The RO-028 row arrives with PR #23 (status, not merged yet). This PR leaves `TASKS.md`
  alone to avoid a conflict; RO-028's status is updated after both merge.

## Next steps
- **Owner device check** in Expo Go, at this PR's head:
  - On home, the "Sensor: Simulated device" panel starts fully visible, just below the "RepOne" title.
  - Scrolled back to the top, nothing hides under the bar.
  - On History, the first row is fully visible below the "History" title.
- Then the owner merges, and RO-028 is marked done in the next status update.
