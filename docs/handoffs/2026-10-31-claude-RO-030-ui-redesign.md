# Handoff — RO-030: mobile UI redesign

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-31 |
| **Task** | RO-030 (`TASKS.md`) |
| **Branch** | `claude/RO-030-ui-redesign` (base: `main` @ `b414307`) |
| **Commits** | `62152f4` RO-030: mobile UI redesign — light/dark design system, tab navigation, dashboard, live set and history; `de60947` docs; then the merge of RO-031 (Expo SDK 58), with the SDK 58 fixes and this file's update |
| **Pull request** | not opened yet: `gh` is not installed on this machine, so the owner opens it from the compare link |
| **Status** | implemented and verified by tests and Expo export; **not yet seen on a device** |

## Objective
The owner asked for a complete redesign of the mobile UI as a polished, original fitness product, keeping every
existing feature working. The direction: clean light backgrounds, strong purple primary actions, rounded cards with
subtle depth, bold statistics, colorful progress graphics, a refined bottom navigation, purposeful animation, and
consistent light and dark themes. A marketing image was the visual inspiration. Its branding, illustrations,
layouts and unsupported metrics were not used, and no feature or metric was invented.

## What changed
**Design system (`src/shared/`)**
- **Tokens:** light and dark palettes with the same keys. `full` (green) and `partial` (amber) always mean those rep
  classifications, in every chart and counter. There are also spacing, radius and type scales.
  - A test checks 12 text/background pairs in both palettes for WCAG contrast of at least 4.5:1.
  - That test caught two real failures, which are fixed with the `primaryText` and `fullText` tokens and a darker
    light-mode `danger`.
- **Theme hooks:** `useTheme()` follows the phone's appearance setting (`app.json` `userInterfaceStyle: "automatic"`,
  `StatusBar style="auto"`). `useThemedStyles()` builds each component's styles once per theme.
- **Motion:** shared durations, and `useReducedMotion()`. With the system Reduce Motion setting on, animations jump
  to their end state and the decorative loops stop.
- **Components:**
  - `Card`, `PrimaryButton` (primary / danger / secondary, with a press-scale and an optional icon), `StatTile`,
    `Screen` / `ScreenHeader`;
  - `RingChart` (concentric rings, arcs animate between values) and `BarChart` (stacked bars that grow in);
  - `Icon`: line icons drawn for this app in SVG, so there is no icon-font dependency;
  - `TabBar`, `FadeIn` (staggered entrance), `PressableScale`, `PulseDot`, `PopNumber` (pops when a rep is counted)
    and `SpinningArc`.
- **`ProvenanceBadge`** is themed. Its labels and its wrap-instead-of-clip layout (RO-023) are unchanged. "Live
  sensor" is now green instead of grey; simulated and replay data stay amber.

**Navigation (`app/_layout.tsx`)**
- Three tabs, **Today**, **Record** and **History**, in a floating rounded tab bar with a sliding highlight. While a
  set records, Record shows a pulsing red dot that is visible from the other tabs.
- The tabs use expo-router's own JS tabs (`expo-router/js-tabs`), so no navigation package was added.
- Screens draw their own large titles below the safe-area inset, so nothing starts under a translucent header any
  more. That should fix **RO-028**; the owner confirms on the iPhone.
- The home title used to be the product name. It is now "Today", so the UI adds no new product-name occurrence
  (ADR 0006).

**Today (`app/index.tsx`, new dashboard)**
- **Today ring:** today's reps split into full and partial, with the full-rep share in the middle. It shows a
  composition, not progress toward a goal; the app has no goals.
- Today's sets, full reps and partial reps.
- A "Start a set" button, which reads "Back to the live set" while a set records.
- A **Last 7 days** stacked bar chart of full and partial reps per day.
- Sensor status (without the test control) and the latest set.
- Everything is counted from stored sets. Each summary carries the provenance badge of the least real data it
  includes, so any total that includes a simulated set reads "Simulated data — not a real measurement".

**Record (`app/record.tsx`, new route; the old home screen's flow)**
- The behaviour is unchanged:
  - connect and disconnect;
  - the "Simulate connection loss" test control, still dashed amber and labelled "Test control · simulated device
    only";
  - the optional machine label;
  - Start simulated set, Stop set, then New set;
  - the error messages.
- **Live rep ring:** the inner ring is this set's full/partial split, with a big full-rep count that pops on each
  rep. An outer arc circles while recording; it is an activity indicator, not progress.
- Elapsed time (phone clock), samples, all reps, the provenance badge, and the "Algorithm-derived counts, unvalidated
  on real hardware" note.
- **Reps this set:** one bar per detected rep, colored full or partial. Bar height is the rep's peak excursion
  relative to the largest in the set; it shows no units, because the value is algorithm-derived.
- After a set: a "Saved to History on this device" confirmation, New set, and View history.

**History (`app/history.tsx`)**
- Sets grouped by day ("Today", "Yesterday", then dates), totals for the loaded sets, and cards that enter in a
  stagger. Each card shows full reps, partial reps, label, time, duration and provenance.

**Features**
- **`rep-tracking/liveSessionStore.ts`:** keeps the current set's rep timeline and the phone time when recording
  started. Both reset when the next set starts; the finished set's strip stays visible until New set. The
  controller, contracts and persistence are untouched.
- **`workouts/historyStats.ts`:** pure summaries (totals, the provenance rule, last N days, grouping by day,
  duration), tested.
- **`device-connection`:** the panel is restyled; its states and actions are unchanged. A `showTestControl` prop
  hides the test control on the dashboard; it stays on Record.

**Tooling**
- **Built on Expo SDK 58 (RO-031).** The owner's current Expo Go needs SDK 58. RO-031's branch
  (`claude/RO-031-expo-sdk-58`) is merged into this one, so this branch runs in today's Expo Go.
- **`react-native-svg` 15.16.0:** installed with `npx expo install`. It is the version SDK 58's Expo Go bundles, so
  the app stays Expo Go compatible. Before the SDK 58 merge it was 15.15.4, SDK 57's version.
- **SDK 58 tab-bar API.** The custom tab bar receives `emitter` and `navigateToTab(routeKey)` instead of `navigation`.
  `TabBar.tsx` uses them the same way expo-router's built-in tab bar does: emit `tabPress`, then navigate unless the
  press was prevented.
- **No Jest workaround for React.** On SDK 57 this branch needed a Jest `moduleNameMapper`, because two Reacts were
  installed. RO-031's root override installs one React, so the mapper was removed in the merge.
- **No `.value` in style objects.** Expo's Babel preset includes the Reanimated plugin, which treats `x.value` inside
  a style object as a shared-value read and injects a dev warning. The bar segments' field is named `amount` and
  StatTile's style key is `number` for that reason.

## Files changed
- `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`, `apps/mobile/app/history.tsx` — modified
- `apps/mobile/app/record.tsx` — added
- `apps/mobile/app.json` — modified (`userInterfaceStyle: "automatic"`)
- `apps/mobile/package.json` — modified (`react-native-svg`)
- `package-lock.json` — modified: `react-native-svg` and its dependencies (`css-select`, `css-tree` and others).
- Through the RO-031 merge: the SDK 58 versions, the root `package.json` React override, and `app.json`'s
  `expo-status-bar` plugin. Those are RO-031's changes and are described in its handoff.
- `apps/mobile/src/shared/` — modified:
  - `index.ts`, `theme/tokens.ts`, `components/PrimaryButton.tsx`, `components/ProvenanceBadge.tsx`.
- `apps/mobile/src/shared/` — added:
  - `motion.ts`, `theme/theme.ts`, `theme/__tests__/tokens.test.ts`;
  - `components/{BarChart,Card,FadeIn,Icon,PopNumber,PressableScale,PulseDot,RingChart,Screen,SpinningArc,StatTile,TabBar}.tsx`.
- `apps/mobile/src/features/rep-tracking/`:
  - modified: `liveSessionStore.ts`, `index.ts`, `__tests__/liveSessionStore.test.ts`;
  - added: `components/{LiveRepRing,RepStrip}.tsx`, `useElapsed.ts`, `__tests__/liveDisplay.test.tsx`;
  - deleted: `components/RepCounter.tsx`.
- `apps/mobile/src/features/workouts/`:
  - modified: `index.ts`;
  - added: `historyStats.ts`, `components/{SetCard,TodaySummaryCard,WeeklyRepsCard}.tsx`,
    `__tests__/{historyStats.test.ts,workoutCards.test.tsx}`.
- `apps/mobile/src/features/device-connection/components/DeviceConnectionPanel.tsx` — modified
- `TASKS.md` — modified:
  - the RO-030 row and details;
  - a status note on my own RO-028 task;
  - the next free ID is now RO-032 (RO-031 is the SDK 58 upgrade).
- `docs/handoffs/2026-10-31-claude-RO-030-ui-redesign.md` (this file) and `docs/handoffs/README.md` — added / modified

## Tests and checks (exact results)
| Command | Result |
|---|---|
**On Expo SDK 58**, after merging RO-031 @ `4cff3ca` (clean `npm ci` from the merged lockfile):

| Command | Result |
|---|---|
| `npm run verify` | **exit 0**:<br>• `✓ module boundaries OK (99 files checked, no circular imports)`<br>• `✓ workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files: no AI API integrations, least-privilege permissions)`<br>• typecheck OK in all four workspaces<br>• script tests 62/62<br>• Jest **211/211**: mobile 77 (10 suites), rep-engine 27, sensor-contracts 103, workout-domain 4 |
| `npx expo install --check` (in `apps/mobile`) | `Dependencies are up to date` |
| `npx expo-doctor` (in `apps/mobile`) | `20/20 checks passed. No issues detected!` |
| `npx expo export --platform ios --platform android` (in `apps/mobile`, output to a temp folder) | exit 0; iOS and Android bundles 2.9 MB each |

**Codex round 1 ([PR #30](https://github.com/bransondang3307-beep/RepOne/pull/30), review of `8385fb0`).** CI was
green on `8385fb0`. Codex raised two P1 findings, both about provenance, and both are fixed in the round-1 commit:
1. History's totals card showed rep totals without a provenance badge. It is now `HistorySummaryCard`, which shows
   `ProvenanceBadge` with `provenanceOf(sessions)`, the same least-real rule as Today.
2. `SetCard` is one accessibility element whose label replaced the badge's text, so VoiceOver didn't announce the
   simulated-data warning. The label now ends with the provenance wording, via the new `provenanceLabel()` from
   `shared`.

After the fix (clean `npm ci`):
- `npm run verify` exit 0: boundaries OK (100 files), script tests 62/62, Jest 215/215 (mobile 81, rep-engine 27,
  sensor-contracts 103, workout-domain 4);
- `expo install --check` up to date; `expo-doctor` 20/20; iOS and Android export OK.

The only visible change is the provenance badge in History's totals card; the rest of the UI the owner accepted is
unchanged.

**Earlier, on SDK 57** (`62152f4`, before the merge): `npm run verify` exit 0 with the same counts, and the export
also succeeded. `npm audit`: 39 findings on SDK 57, none in `react-native-svg` or its dependencies; RO-031's handoff
has the SDK 58 count.

**New tests:**
- **Palette:** contrast and token completeness, in both themes.
- **`historyStats`:** totals, the provenance rule, the 7-day series, grouping by day (with today and yesterday),
  local midnight, durations.
- **Workout cards, rendered in light and dark:** the Today ring and totals count only today's stored sets and carry
  the badge; the empty state has no badge; the weekly chart counts the 7-day window only; the set card shows its
  counts and provenance.
- **Live display, in both themes:** the ring's spoken counts and recording state; one bar per rep; elapsed-time
  formatting.
- **`liveSessionStore`:** the timeline matches the counts; the start time comes from the injected clock; both reset
  on New set.

**Environment:** Windows 11, Node v24.22.0, npm 11.19.1. Not run here:
- a device or simulator run. Expo Go needs the owner's phone, and the web target isn't installed, so **I have not
  seen the screens rendered**. Layout and animation are checked only by typecheck, tests and the bundle build;
- `expo lint` (no ESLint config yet, RO-017).

## Decisions / ADRs
- **No ADR.** This is UI only, with no change to contracts, units, the algorithm or the architecture's layers. The
  boundary checker passes; shared code imports nothing from features, application or infrastructure.
- **One PR, not the two I suggested.** The theme replaces the old static `colors` export that every screen used. A
  "design system only" PR would therefore have left the screens half themed (dark mode broken), with a second device
  check. One PR with a single code commit is easier to review and check.
- **Rings show composition or activity, never progress.** The app has no goals or targets.
- **Dark mode follows the system,** with no in-app switch. That needs no stored preference.

## Known limitations / risks
- **Not seen on a device.** Spacing, the SVG rings, the tab bar on notched and Android phones, and animation smoothness
  need the owner's Expo Go check (below).
- **Android in a development build.** Expo Go follows the phone's dark mode. A future development build (RO-029 part 3)
  needs `expo-system-ui` for `userInterfaceStyle` to apply on Android; I didn't add it.
- **Depends on RO-031.** Merge RO-031 first. This PR then shows only the redesign. Until then, its diff against
  `main` also includes the SDK 58 upgrade.
- **Dashboard limit.** The dashboard loads the 500 most recent sets. Someone with more than 500 sets in 7 days would
  see a truncated week.
- **Rep strip.** The controller publishes only the last event when one sample completes two reps at once, which is
  practically impossible for the detector. The strip could then show one bar fewer than the count; the test confirms
  they match on 20 s of synthetic motion.
- **Merge overlap with the Bluetooth stack (RO-029, PRs #25–#28) and RO-028 (PR #24).** SDK 58 Bluetooth
  compatibility is **provisional**: only JavaScript-level checks have run. It stays provisional until a native SDK 58
  development build and a physical test with the sensor pass. An SDK 57 development build or device check doesn't
  count for SDK 58.
  - **Integration base (owner direction, 2026-11-01).** Integrate on PR #28's latest corrected and reviewed head.
    - Don't use the RO-029 acceptance candidate `23addb5` (PR #28 `18bb7b3` + PR #24 `6bb2514`) as the base: it has
      known P1 findings.
    - On 2026-11-01, PR #28's head on GitHub was still `18bb7b3`.
  - **Local trial merges, not committed or pushed:**

    | Trial | Result |
    |---|---|
    | RO-031 `4cff3ca` + PR #28 `18bb7b3` | `npm run verify` exit 0: boundaries OK (94 files), script tests 67/67, Jest 334/334 (mobile 124, rep-engine 27, sensor-contracts 103, sensor-protocol 76, workout-domain 4). `expo install --check` OK; `expo-doctor` 20/20; iOS and Android export OK |
    | RO-031 `4cff3ca` + `23addb5` (superseded) | `npm run verify` exit 0; Jest 336/336; Expo checks as above |

    - `npx expo config --type introspect` shows the `react-native-ble-manager` config plugin still writing
      `NSBluetoothAlwaysUsageDescription` and the Android Bluetooth permissions under SDK 58.
    - **Not run:** the firmware host tests, `expo prebuild` or any native compile, a development build, and any radio
      or iPhone test.
    - `react-native-ble-manager` declares `react-native: "*"`. That peer range is no evidence of native
      compatibility with React Native 0.88.1.
  - **What RO-029 must change for SDK 58** when it is rebased on, or merged with, RO-031:
    - `expo-dev-client` `~57.0.20` → `~58.0.18`, using `npx expo install expo-dev-client`;
    - keep `react-native-ble-manager` 12.6.1, the latest release. Its native build on SDK 58 is unverified;
    - add `expo-status-bar` next to its `react-native-ble-manager` entry in `app.json` `plugins`;
    - regenerate `package-lock.json` (`npm install`);
    - the development build must be rebuilt for SDK 58. A build made on SDK 57 doesn't validate SDK 58.
  - **PR #24 (RO-028) adds a Jest `moduleNameMapper` to `<rootDir>/node_modules/react`.** After RO-031 there is no
    `apps/mobile/node_modules/react` (one React, at the root), so that mapper must be dropped. The trial passed
    without it.
  - **Code overlap with RO-030.** A trial merge of this branch with `23addb5` (superseded) conflicts in `app/index.tsx`,
    `app/history.tsx`, `DeviceConnectionPanel.tsx`, `liveSessionStore.ts`, `app.json`, `package.json` and the
    lockfile. Whichever lands second must:
    - port RO-029's sensor choice, scan list and Bluetooth notes into the redesigned panel and the Record screen,
      following `docs/ui/sensor-connection-interface.md` on the RO-029 branch;
    - rename `startSimulatedSet` to `startSet` on Record, and keep the "Start set" / "Start simulated set" wording;
    - keep RO-030's rep timeline in `liveSessionStore`;
    - replace RO-028's route inset test, since RO-030's screens use safe-area padding instead of the translucent
      header.
  - RO-030 now keeps `main`'s panel title wording, "Sensor: Simulated device", which that interface document relies on.

## Owner acceptance so far
- **2026-11-01: visual acceptance only.** The owner tested the redesigned UI on an iPhone in Expo Go and reported:
  "I tested the redesigned UI and it looks good".
  - The tested candidate is `43217e40dc4afdacb326cc646e6e1dec6bac0b23`: the owner's clone `RepOne-candidate` was
    checked out at that commit.
  - The app code is unchanged since then. Later commits on this branch change docs only.
  - The owner asked for this to be recorded as **visual acceptance only**. It does not record that any functional,
    dark-mode, persistence or connection-loss check passed.
- **Still required before merge:** the functional steps of the checklist below, reported by the owner as pass or fail:
  - 1 (opens on SDK 58 with no error screen; the empty state);
  - 3 (simulated recording) and 4 (the live dot);
  - 5 (stop and save) and 6 (History);
  - 7 (Today matches the set);
  - 8 (connection loss) and 9 (persistence after force-quit);
  - 10 (dark mode).

  Steps 11 (Reduce Motion) and 13 (Android) are optional. Steps 2 (navigation) and 12 (animations) are partly visual;
  the owner should confirm them explicitly.

## Owner's combined iPhone acceptance checklist
One check covers both RO-031 (Expo SDK 58) and RO-030 (the redesign), on the candidate branch
`claude/RO-030-ui-redesign`, which contains RO-031's final head `4cff3ca`. Use the current App Store Expo Go; it must
show SDK 58. All data is simulated. The startup commands are in the report that accompanies this candidate.

1. **Opens on SDK 58:** Expo Go loads the app with no "incompatible SDK" or red error screen. It opens on **Today**,
   with the date and a large "Today" title below the status bar (RO-028). With no sets: the ring shows "–" and
   "no reps yet", the stats are 0, and there is no badge.
2. **Tabs:** tap Record, History and Today. The highlight slides to the active tab, and labels and icons turn purple.
3. **Record a set:**
   - On Record, the panel reads "Sensor: Simulated device · Not connected". Tap **Connect**: the dot pulses green, the
     state reads "Connected" and the button reads "Disconnect".
   - Enter a label and tap **Start simulated set**. The outer arc circles, the status reads "Recording" with a red dot,
     elapsed time ticks, and the samples count rises.
   - The full-rep number pops on each rep. The ring fills green and amber, and bars appear under "Reps this set".
4. **Live dot:** while recording, switch to Today. The Record tab shows a pulsing red dot, and the main button reads
   "Back to the live set".
5. **Stop:** tap **Stop set**. You see "Set saved" and "Saved to History on this device", plus New set and View
   history. The yellow badge reads "Simulated data — not a real measurement", in full and not clipped.
6. **History:** the set appears under "Today", with its counts, label, time, duration and the simulated badge. The
   totals card is correct.
7. **Today:** the ring, the totals and today's bar in "Last 7 days" match the recorded set, with the simulated badge.
   "Latest set" shows it, and "See all" opens History.
8. **Connection loss:** start a set, then tap **Simulate connection loss**. The set ends in error with the existing
   message ("…The N samples received before the failure were saved."). Reconnect and record again.
9. **Persistence:** force-quit and reopen. The sets are still in History and on Today.
10. **Dark mode:**
    - Switch the phone to dark mode and repeat steps 1–7 briefly.
    - The background is near-black and the cards dark grey. Text stays readable, the purple buttons stay purple, and
      the status bar text is light.
11. **Reduce Motion (optional):** turn on Settings → Accessibility → Motion → Reduce Motion. The screens appear
    without sliding in, the ring jumps to its value, and nothing loops.
12. **Animations and feel:** cards slide in on each screen, buttons shrink slightly when pressed, and the tab
    highlight slides. Nothing stutters, jumps or flickers, and the app stays responsive while recording.
13. **Android (if available):** steps 1–3, 5 and 10. Check that the tab bar sits above the gesture or navigation bar.

Report pass/fail per step, with a screenshot of anything that looks wrong, as a comment on the RO-030 PR. Name the
candidate SHA in it.

## Next steps
1. Owner: open the PR from the compare link
   `https://github.com/bransondang3307-beep/RepOne/compare/main...claude/RO-030-ui-redesign`. Codex reviews it
   automatically when it opens.
2. Owner: run the combined checklist above and report the results on the PR. The same run covers RO-031.
3. Claude Code: address Codex findings per `docs/automation/claude-codex-workflow.md` §4 (at most two fix rounds).
4. After the merge: my status-update PR (RO-030 done; RO-028 done if step 1 of the checklist passed).

## Questions for the owner
- Should RO-014 (Milestone 4: home dashboard, exercise selection, pause/reset) now be re-scoped to what is still
  missing after RO-030, mainly exercise selection and pause/reset, which need RO-013?
- PR #22 (`claude/RO-025-dependency-security`) duplicates the merged PR #21 and collides with RO-025's ID. Can it be
  closed?
