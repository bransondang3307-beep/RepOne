# Handoff — RO-029 part 3: iPhone BLE adapter, native configuration, development build, minimal UI

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-31 |
| **Task** | RO-029 (owner-directed 2026-10-31) |
| **Branch** | `claude/RO-029-ble-adapter` (base: `claude/RO-029-firmware`, part 2; stack: #25 → #26 → #27 → this) |
| **Commits** | see the PR |
| **Pull request** | see the PR |
| **Status** | implemented · tested against a fake central and a mocked native module · **not verified on any radio, iPhone or sensor** |

## Objective
Connect the real-sensor path to the app:
- a BLE `DeviceConnection` adapter that feeds the existing session pipeline;
- the native configuration and a development-build setup;
- the minimal UI needed to exercise it.

Simulation must keep working, and the app must never fall back to it silently.

## What changed
- **Library:** **`react-native-ble-manager` 12.6.1**, pinned exactly.
  - It is a New Architecture TurboModule, needed for React Native 0.86. It was released 2026-10-30, under
    Apache-2.0, has no dependencies and no install scripts, and ships an Expo config plugin.
  - Rejected: `react-native-ble-plx` 3.5.1. It is a legacy native module with no codegen; its last release was
    2026-02, and its separate config plugin targets Expo 49.
- **`apps/mobile/src/infrastructure/bluetooth/`** (the second infrastructure adapter; RO-025's rules apply):
  - **`BleCentral`:** the native-boundary port.
  - **`BleSensorDevice`** (`DeviceConnection`):
    - **Connect:** a radio and permission check, then the handshake: the connect, GATT discovery checking the
      protocol's service and characteristics, the device-info packet and its notifications. One 10 s deadline bounds
      the whole handshake (iOS connects never time out); it starts once the radio is on, so the user's time at the
      permission prompt never counts against it.
    - **Identity:** `deviceId = imu-<serial>`; channels `imu-<serial>-ch<n>`. Never the phone's peripheral id.
    - **Channel sources:** kind `ble`, provenance `sensor`. Starting one enables the shared sample notifications;
      packets are decoded and tracked (`@repone/sensor-protocol`) and routed to their channel in order. Delivery stops
      mid-batch when a channel stops or fails.
    - **Failures, each with an actionable reason:**
      - Bluetooth off, denied or unsupported → `unavailable`;
      - connect timeout → `timeout`;
      - not a compatible sensor, invalid or unconfigured device info, or IMU not found → `unavailable`;
      - link loss or Bluetooth turned off → `connection_lost`;
      - a stream restart mid-run (sensor reset) → `connection_lost`;
      - 1 s without data → `stream_timeout`;
      - five unreadable packets in a row → `invalid_data`;
      - a device-reported IMU read failure → `unknown`.
    - **Hygiene:** a link epoch makes callbacks from an older link and old channel objects inert; tracker resets on
      every subscription; one set of central listeners per device, released by `dispose()`.
    - **Serialized native operations, never hung on them** (Codex review rounds 1–3):
      - a failed or closing link is torn down completely before the next connect, including the OS's disconnect
        event, which is recognised as ours and never as a loss;
      - disabling notifications finishes before the next enable; a disable queued on a link that has since ended is
        skipped, so it never reaches a later connection;
      - a pending enable is cut off when its link ends, so `stop()`, `disconnect()` and switching sensors never wait
        on a native operation that does not answer (`stop()` sends the disable without awaiting it);
      - a start cancelled while notifications were being enabled is retired, and releases them once they come up;
      - a scan stopped while still preparing (e.g. at the permission prompt) never starts;
      - every handshake step races the attempt's deadline and abort signal, so a step that never answers ends the
        attempt at the connect timeout, and `disconnect()` (which lets a pending attempt finish, as ADR 0007 requires)
        returns then too (round 3);
      - a link loss during the handshake ends the attempt at once; before the attempt asks the OS to connect, radio
        reports belong to `prepare()`, so iOS's `unknown` while its permission prompt is open is not a loss (round 3);
      - switching sensors calls `cancelConnect()`, which ends a pending attempt at once (round 3);
      - a channel's start fails with `start_failed` if the sample enable does not answer within 10 s (round 3).
  - **`BleSensorScanner`:** filters by service UUID only, reports each sensor once, stops after 10 s.
  - **`createNativeBleCentral`:** the only file that touches the native module.
    - It loads it **lazily, only if present**. In Expo Go it returns null, because importing the library there
      throws.
    - It maps UUIDs to lowercase, values to bytes, and properties.
    - It asks for Android runtime permissions; iOS asks by itself. `prepare()` waits for a definite radio state:
      up to 60 s while iOS reports `unknown` (the user has not answered the permission prompt yet: the user's time),
      and up to 5 s while it reports `resetting` (the system's time). It then reports what it saw, with "If the phone
      asked for Bluetooth permission, answer it, then try again", and the next attempt asks again (round 3). A failed
      native start is retried, never cached.
    - Each notification registration owns its entry: a late failure of an older enable never removes a newer link's
      target (round 3).
- **`apps/mobile/src/application/sensorSelection.ts`:** the explicit choice between simulated and Bluetooth.
  - Choosing Bluetooth without a sensor gives a device that refuses to connect with "Choose a sensor first", so there
    is **never a fallback** to simulation.
  - Switching disconnects and disposes of the previous device.
  - `AppContainer.device` is replaced by `AppContainer.sensors`.
  - `simulateConnectionLoss` acts only on the simulated device.
- **UI (minimal, no redesign):**
  - **Panel:** a *Simulated / Bluetooth sensor* choice. Bluetooth is disabled in Expo Go, with a note.
  - **Bluetooth picker:** *Scan for sensors*, a list showing name and RSSI, and tap to choose.
  - **Connection row:** Connect / Disconnect / Reconnect as before, plus the sensor's own report once connected
    (serial, firmware, rate, IMU count).
  - **Home screen:**
    - *Start set* vs *Start simulated set*;
    - the badge shows *Live sensor* for a real sensor;
    - a note that rep counts use a placeholder calibration for a real sensor;
    - the live sample count during a set, as before.
- **Native configuration:**
  - `app.json` plugin `react-native-ble-manager`: iOS `NSBluetoothAlwaysUsageDescription` (brand-neutral text); Android
    BLE permissions, with `neverForLocation`.
  - `eas.json` `development` profile.
  - `expo-dev-client` ~57.0.20 on SDK 57. After the SDK 58 integration it is ~58.0.18, as Expo SDK 58's module list
    specifies; see the integration section below.
  - Scripts `start:go` (Expo Go) and `start:dev-build`.
- **Docs:**
  - `docs/guides/real-sensor-development-build.md` (new): Expo Go vs development build, what signing requires, costs
    and the owner decisions, and the exact steps to the first notification;
  - `docs/architecture.md` module G; `docs/hardware-protocol.md` §3; `README.md`.

## Files changed
- Added: `apps/mobile/src/infrastructure/bluetooth/**`, `apps/mobile/src/application/sensorSelection.ts`,
  `apps/mobile/eas.json`, `docs/guides/real-sensor-development-build.md`, this handoff.
- Modified:
  - `apps/mobile/src/application/{createAppContainer,index}.ts`;
  - `apps/mobile/src/features/device-connection/{deviceConnectionStore.ts,components/DeviceConnectionPanel.tsx}`;
  - `apps/mobile/src/features/rep-tracking/liveSessionStore.ts`;
  - `apps/mobile/app/index.tsx`;
  - the store tests;
  - `apps/mobile/{app.json,package.json}`, `package-lock.json` (additions only);
  - `docs/architecture.md`, `docs/hardware-protocol.md`, `README.md`.

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npx jest` in `apps/mobile` | **136/136** (was 31). Includes the ordering regressions: 5 from round 1 fail on `ef72348`; 3 of the 4 from round 2 fail on `233a78c` (the fourth guards sensor switching); 11 of the 13 from round 3 fail on `18bb7b3` (the other two guard that permission time is never a connect timeout and that both radio waits stay bounded). Adds: the device contract suite ×2 (instant; 200 ms connect with 2 channels), the sensor-source contract on a BLE channel (independent harnesses), BLE-specific failure, identity and hygiene tests, the native-binding mapping (mocked module), selection and store tests, and two end-to-end sets through the app's container |
| Mutation checks | Removing the mid-batch stop: 4 tests fail. Ignoring stream restarts: 1 fails. Both restored |
| `npx tsc --noEmit` (mobile) | OK |
| `npx expo config --type prebuild` | OK; the plugin resolves |
| `CI=1 EXPO_OFFLINE=1 npx expo prebuild --no-install --clean`, with a placeholder bundle id (discarded) | OK. `Info.plist` has `NSBluetoothAlwaysUsageDescription`; `AndroidManifest.xml` has `BLUETOOTH_SCAN` with `neverForLocation` |
| `EXPO_OFFLINE=1 npx expo install --check` | "Dependencies are up to date" (offline mode is unreliable, as Expo warns) |
| `npx expo export --platform ios` / `android` | both exit 0 |
| `npm run verify` (Node 22.22.0) | exit 0. Boundaries OK; workflow policy OK; typecheck OK; script tests 67/67; Jest 346/346 (mobile 136, rep-engine 27, sensor-contracts 103, sensor-protocol 76, workout-domain 4), after review round 3 |
| `npm run test:firmware` | protocol 62/62; MPU-6050 driver 16/16 (fake Wire bus) |

**Not tested:**
- no iOS build (it needs EAS or a Mac);
- no CoreBluetooth;
- no radio, iPhone or sensor;
- `docs.expo.dev` and `expo.dev` are unreachable from this environment, so the signing and pricing statements come
  from search results that quote Expo's docs, and the guide says so.

## Decisions / ADRs
- It implements ADR 0008 (Proposed).
- **Proposed in code:**
  - a 10 s connect timeout;
  - a 1 s stream watchdog;
  - five bad packets in a row → `invalid_data`;
  - a stream restart mid-run ends the set.
- **Owner decisions:**
  - the build route and its cost (EAS with a paid Apple Developer membership, or a Mac);
  - the bundle identifier;
  - the wireless board.

## Known limitations / risks
- **Placeholder calibration.** Real-sensor sets use the existing synthetic calibration (policy unchanged), so their rep
  counts are meaningless until a calibration step exists. The UI says so.
- **USB.** The Uno USB path has no phone adapter: iOS cannot read it. It is a PC-side bring-up path.
- **Expo Go users.** `npx expo start` now opens dev-client mode; use `npx expo start --go`. This is documented.
- **Unverified iOS details.** iOS MTU, background behaviour and permission timing are unverified. There is no
  background BLE (sets record in the foreground).
- **Android** is configured but untested.

## Next steps
1. **Owner:** choose the build route and the board.
2. **Hardware:** H0 bring-up over USB (part 2's checklist), then the BLE board's firmware backend.
3. **The first development build and BLE notification:** the guide, §4.

## Integration with Expo SDK 58 and the redesign (PRs #29 and #30)

A normal merge of the redesign head `4f847cf` (which contains SDK 58) into this branch. No rebase, and no rewritten
history.

- **Dependencies:** SDK 58's set, plus `react-native-ble-manager` 12.6.1, `@repone/sensor-protocol` and
  `expo-dev-client` ~58.0.18.
  - **Lockfile:** regenerated from SDK 58's lockfile with npm 11, the format it was written in. The change is
    additions only: those packages and their dependencies.
  - Every Expo-managed version matches `expo/bundledNativeModules.json` for expo 58.0.22.
- **Plugins:** `expo-router`, `expo-sqlite`, `expo-status-bar` (from SDK 58) and `react-native-ble-manager`.
- **Jest:** the redesign's config has no `moduleNameMapper`. PR #24's React mapping was not brought in: SDK 58's root
  `overrides` makes it obsolete.
- **UI, ported into the redesign** (the semantics of `docs/ui/sensor-connection-interface.md`):
  - **Record tab:**
    - the Simulated / Bluetooth choice, as a radio group;
    - the Expo Go note;
    - scan and pick;
    - the sensor's own report;
    - every control locked while a set runs;
    - *Start set* vs *Start simulated set*;
    - the provenance badge following the chosen sensor before a set;
    - the placeholder-calibration note.
  - **Today tab:** the compact connection panel.
  - **Store:** `startSet` replaces the redesign's `startSimulatedSet`.
- **Checks**, on a clean `npm ci` with no `node_modules` in any parent directory:

  | Check | Result |
  |---|---|
  | `npm run verify` | exit 0; mobile Jest 196/196, including the new panel render test |
  | `npm run test:firmware` | 62/62 and 16/16 |
  | `npx expo config --type prebuild` | OK |
  | `CI=1 EXPO_OFFLINE=1 npx expo prebuild --no-install --clean`, with a placeholder bundle id (discarded) | OK; the Bluetooth usage text is in `Info.plist`, and `BLUETOOTH_SCAN` with `neverForLocation` is in the manifest |
  | React Native 0.88.1 codegen (`generate-codegen-artifacts.js`), iOS and Android | exit 0; `BleManagerSpec` is generated. All 36 Android spec methods are implemented; on iOS, 36 in the module and the 12 event emitters in the generated base class |
  | `npx expo export --platform ios` / `android` | both exit 0 |
  | `npx expo install --check` | **not run:** this environment's network policy blocks `api.expo.dev`. Versions were checked against Expo's bundled module list instead |
  | Native compile (Xcode, Gradle) | **not run:** there is no Xcode, and `dl.google.com` (the Android SDK) is blocked. The first native build is the owner's Mac build (guide §4) |

