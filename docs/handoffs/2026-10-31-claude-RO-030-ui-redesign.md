# Handoff — RO-030: mobile UI redesign

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-31 |
| **Task** | RO-030 (`TASKS.md`) |
| **Branch** | `claude/RO-030-ui-redesign` (base: `main` @ `b414307`) |
| **Commits** | `62152f4` RO-030: mobile UI redesign — light/dark design system, tab navigation, dashboard, live set and history; then the docs commit that adds this file |
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
- **`react-native-svg` 15.15.4:** installed with `npx expo install`. It is the version SDK 57's Expo Go bundles, so
  the app stays Expo Go compatible.
- **Jest `moduleNameMapper` for `react`:** `main` already installs two Reacts, 19.3.1 at the root and 19.2.3 in
  `apps/mobile`. `react-test-renderer` used the other copy, and hooks in shared components crashed the badge test.
  The mapper points Jest at the app's own React; the app bundle is not affected.
- **No `.value` in style objects.** Expo's Babel preset includes the Reanimated plugin, which treats `x.value` inside
  a style object as a shared-value read and injects a dev warning. The bar segments' field is named `amount` and
  StatTile's style key is `number` for that reason.

## Files changed
- `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`, `apps/mobile/app/history.tsx` — modified
- `apps/mobile/app/record.tsx` — added
- `apps/mobile/app.json` — modified (`userInterfaceStyle: "automatic"`)
- `apps/mobile/package.json` — modified (`react-native-svg`, Jest `moduleNameMapper`)
- `package-lock.json` — modified:
  - `react-native-svg` and its 11 dependencies (`css-select`, `css-tree` and others);
  - npm also dropped a stale `packages/core` entry; that directory doesn't exist.
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
  - the next free ID is now RO-031.
- `docs/handoffs/2026-10-31-claude-RO-030-ui-redesign.md` (this file) and `docs/handoffs/README.md` — added / modified

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm ci` (worktree of `main` @ `b414307`), then `npx expo install react-native-svg` | exit 0 |
| `npm run verify` at `62152f4` | **exit 0**:<br>• `✓ module boundaries OK (99 files checked, no circular imports)`<br>• `✓ workflow policy OK (1 workflow, 0 action, 5 package, 1 lock files: no AI API integrations, least-privilege permissions)`<br>• typecheck OK in all four workspaces<br>• script tests 62/62<br>• Jest **211/211**: mobile 77 (10 suites), rep-engine 27, sensor-contracts 103, workout-domain 4 |
| `npx expo install --check` (in `apps/mobile`) | `Dependencies are up to date` |
| `npx expo export --platform ios --platform android` (in `apps/mobile`, output to a temp folder) | exit 0. iOS bundle 2.8 MB, Android bundle 3.1 MB |
| `npm audit` | 39 findings (5 low, 29 moderate, 5 high). None is in `react-native-svg` or its new dependencies. I did not re-measure `main`'s count in this session. RO-027's handoff recorded 19 on 2026-10-29; new advisories have been published since |

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
- `expo-doctor` and `expo lint` (no ESLint config yet, RO-017).

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
- **Duplicate React (pre-existing on `main`).** The Jest mapper path `<rootDir>/node_modules/react` assumes npm keeps
  installing the app's React under `apps/mobile`. If a future lockfile hoists it, the mapper needs updating. The
  duplicate itself is worth a separate look.
- **Dashboard limit.** The dashboard loads the 500 most recent sets. Someone with more than 500 sets in 7 days would
  see a truncated week.
- **Rep strip.** The controller publishes only the last event when one sample completes two reps at once, which is
  practically impossible for the detector. The strip could then show one bar fewer than the count; the test confirms
  they match on 20 s of synthetic motion.
- **Merge overlap with RO-029:**
  - RO-029's open branches don't touch `apps/mobile`.
  - They do change `package-lock.json`, adding the `packages/sensor-protocol` workspace, and one `TASKS.md` line.
  - Whichever merges second needs `npm install` to regenerate the lockfile, plus a one-line `TASKS.md` resolution.
  - RO-029 part 3 (the BLE adapter UI) will build on these components.

## Owner's Expo Go checklist (iPhone; Android too if available)
Start with `npm ci`, then `cd apps/mobile && npx expo start`, and scan the QR code. All data is simulated.

1. **Launch:** the app opens on **Today** with the date and a large "Today" title, below the status bar (RO-028).
   With no sets: the ring shows "–" and "no reps yet", the stats are 0, and there is no badge.
2. **Tabs:** tap Record, History and Today. The highlight slides to the active tab, and labels and icons turn purple.
3. **Record a set:**
   - On Record, connect the simulated device; the dot pulses green and the button reads "Disconnect".
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
12. **Android (if available):** steps 1–3, 5 and 10. Check that the tab bar sits above the gesture or navigation bar.

Please note any screen that looks wrong. A screenshot helps.

## Next steps
1. Owner: open the PR from the compare link
   `https://github.com/bransondang3307-beep/RepOne/compare/main...claude/RO-030-ui-redesign`. Codex reviews it
   automatically when it opens.
2. Owner: run the Expo Go checklist above and report the results on the PR.
3. Claude Code: address Codex findings per `docs/automation/claude-codex-workflow.md` §4 (at most two fix rounds).
4. After the merge: my status-update PR (RO-030 done; RO-028 done if step 1 of the checklist passed).

## Questions for the owner
- Should RO-014 (Milestone 4: home dashboard, exercise selection, pause/reset) now be re-scoped to what is still
  missing after RO-030, mainly exercise selection and pause/reset, which need RO-013?
- PR #22 (`claude/RO-025-dependency-security`) duplicates the merged PR #21 and collides with RO-025's ID. Can it be
  closed?
