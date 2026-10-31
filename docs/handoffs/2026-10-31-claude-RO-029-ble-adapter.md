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
    - **Connect:** a radio and permission check, then a connect bounded at 10 s (iOS connects never time out), then
      GATT discovery checking the protocol's service and characteristics, then the device-info packet.
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
    - **Serialized native operations** (Codex review round 1):
      - a failed or closing link is torn down completely before the next connect, including the OS's disconnect
        event, which is recognised as ours and never as a loss;
      - disabling notifications finishes before the next enable, and `stop()` resolves only once the sensor has been
        told to stop;
      - a start cancelled while notifications were being enabled is retired, and releases them once they come up;
      - a scan stopped while still preparing (e.g. at the permission prompt) never starts.
  - **`BleSensorScanner`:** filters by service UUID only, reports each sensor once, stops after 10 s.
  - **`createNativeBleCentral`:** the only file that touches the native module.
    - It loads it **lazily, only if present**. In Expo Go it returns null, because importing the library there
      throws.
    - It maps UUIDs to lowercase, values to bytes, and properties.
    - It asks for Android runtime permissions; iOS asks by itself. `prepare()` waits up to 5 s for a definite radio
      state, because iOS reports `unknown` until the user answers the permission prompt.
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
  - `expo-dev-client` ~57.0.20.
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
| `npx jest` in `apps/mobile` | **120/120** (was 31; 5 of them are the round-1 ordering regressions, which fail on `ef72348`). Adds: the device contract suite ×2 (instant; 200 ms connect with 2 channels), the sensor-source contract on a BLE channel (independent harnesses), BLE-specific failure, identity and hygiene tests, the native-binding mapping (mocked module), selection and store tests, and two end-to-end sets through the app's container |
| Mutation checks | Removing the mid-batch stop: 4 tests fail. Ignoring stream restarts: 1 fails. Both restored |
| `npx tsc --noEmit` (mobile) | OK |
| `npx expo config --type prebuild` | OK; the plugin resolves |
| `CI=1 EXPO_OFFLINE=1 npx expo prebuild --no-install --clean`, with a placeholder bundle id (discarded) | OK. `Info.plist` has `NSBluetoothAlwaysUsageDescription`; `AndroidManifest.xml` has `BLUETOOTH_SCAN` with `neverForLocation` |
| `EXPO_OFFLINE=1 npx expo install --check` | "Dependencies are up to date" (offline mode is unreliable, as Expo warns) |
| `npx expo export --platform ios` / `android` | both exit 0 |
| `npm run verify` (Node 22.22.0) | exit 0. Boundaries OK (94 files); workflow policy OK; typecheck OK; script tests 67/67; Jest 330/330 (mobile 120, rep-engine 27, sensor-contracts 103, sensor-protocol 76, workout-domain 4), after review round 1 |
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
