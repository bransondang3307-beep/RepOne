# Handoff — RO-029 completion: real-sensor pipeline batch (protocol, firmware, BLE adapter)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-31 |
| **Task** | RO-029 (owner-directed 2026-10-31), with RO-025 (prerequisite) and RO-028 (related UI fix) |
| **Branch** | committed on `claude/RO-029-ble-adapter` (PR #28), the top of the stack |
| **Pull requests** | #25 → #26 → #27 → #28 (stacked), plus #24 (independent). None merged; the owner merges |
| **Status** | implemented and reviewed as far as this environment allows; **no physical, radio or iPhone test has run** |

## 1. What exists, and how far it is verified

| Layer | What exists | Verified by | Not verified |
|---|---|---|---|
| **Wire protocol** (ADR 0008, **Proposed**) | `docs/protocols/imu-stream-v1.md`: versioned CRC-checked packets of raw int16 counts plus range codes; sequence numbers, device clock, stream ids; GATT UUIDs; MTU and bandwidth; status codes; USB hex lines | Codex review; three independent implementations agree on the golden bytes: Python (fixture generator), TypeScript and C++ | Real MTU, timing or jitter |
| **Codec** (`@repone/sensor-protocol`) | Decode/encode, unit conversion at the boundary, `StreamTracker` (gaps, duplicates, wraps, restarts, stale data), USB line parser | **76 Jest tests** on synthetic golden packets (every truncation, every bit-flip, invalid numbers, wraps, resets) | Real sensor data |
| **BLE adapter** (`apps/mobile/src/infrastructure/bluetooth`) | `BleSensorDevice` (`DeviceConnection`), `BleSensorScanner`, `createNativeBleCentral` (react-native-ble-manager 12.6.1, loaded lazily) | **Mock-tested only**: the shared device and sensor-source contract suites; failure, identity and hygiene tests and native-operation ordering tests (held teardown, enable/disable, scan preparation) against a **fake central**; native mapping with the **module mocked**; mutation checks | **Any radio, CoreBluetooth or iPhone behaviour**: permissions, MTU, timing, background |
| **App integration** | Explicit Simulated/Bluetooth choice (no fallback), scan and pick, the sensor's own report, Live sensor badge, placeholder-calibration note | Store and end-to-end tests through the app container (fake central); `expo export` iOS and Android | **Not run on a phone yet**: the Expo Go acceptance below is pending |
| **Native configuration** | Plugin (iOS Bluetooth usage text; Android permissions with `neverForLocation`), `eas.json` development profile, `expo-dev-client` ~57.0.20 | `expo prebuild` with a placeholder bundle id (discarded): Info.plist and manifest entries present | **No iOS build has been made** |
| **Uno R3 USB firmware** (`firmware/uno-usb`) | MPU-6050 init and checks, 50 Hz streaming as `S`/`I`/`E` hex lines plus `#` diagnostics, retries | **Compiled** for `arduino:avr:uno` (core 1.8.6, avr-gcc 7.3.0): 9,462 B flash, 601 B RAM. **Host tests:** protocol layer 62/62 against the golden packets; MPU-6050 driver 16/16 against a **fake Wire bus** | **Never flashed or run**; no MPU-6050 verified |
| **Wireless (BLE) firmware** | **Missing, by design:** no board is chosen. `firmware/ble/README.md` lists its duties and the required board capabilities; the portable layer it would use exists and is tested | — | Everything |

## 2. Pull requests: stack, heads and merge order

Heads at the time of writing. The final head of PR #28 includes this file; see its PR body.

| Order | PR | Branch | Base | Head | Codex |
|---|---|---|---|---|---|
| any time | [#24](https://github.com/bransondang3307-beep/RepOne/pull/24) RO-028 iOS title-bar inset | `claude/RO-028-ios-header-inset` | `main` | see PR | see PR (it needs the owner's phone check) |
| 1 | [#25](https://github.com/bransondang3307-beep/RepOne/pull/25) RO-025 boundary hardening | `claude/RO-025-boundary-hardening` | `main` | `cfc2714` | no major issues (after 1 fix round) |
| 2 | [#26](https://github.com/bransondang3307-beep/RepOne/pull/26) RO-029 part 1: protocol and codec | `claude/RO-029-ble-sensor-pipeline` | #25's branch | `deba6da` | no major issues (after 1 fix round) |
| 3 | [#27](https://github.com/bransondang3307-beep/RepOne/pull/27) RO-029 part 2: firmware | `claude/RO-029-firmware` | #26's branch | `5805d2c` | no major issues (after 1 fix round) |
| 4 | [#28](https://github.com/bransondang3307-beep/RepOne/pull/28) RO-029 part 3: BLE adapter and UI | `claude/RO-029-ble-adapter` | #27's branch | see PR | see PR |

- **Merge order:** #25 → #26 → #27 → #28. Each is retargeted to `main` after the one below it merges, with CI on
  `main` after each.
- **#24 and the stack:** #24 is independent; both orders work.
  - #24's route test mocks `useDeviceConnection` as well, so it stays valid once #28's home screen uses that hook.
  - The combined Expo Go candidate (§3) is the stack's top merged with #24.

## 3. Consolidated acceptance plan

### A. Now, in Expo Go (no Bluetooth, no new build)
**What to run:** the integration candidate (stack top + #24), with its SHA posted on PR #28. Start with
`npx expo start --go`: `expo-dev-client` is now installed, so a plain `npx expo start` opens development-build mode.

1. **Launch.** The "RepOne" title is visible and **nothing sits under it** (RO-028). The panel shows:
   - **Simulated** selected, **Bluetooth sensor** dimmed;
   - the note "Real sensors need the development build; Expo Go runs the simulated sensor only.";
   - **Sensor: Simulated device**, **Not connected**, **Connect**.

   The full badge "Simulated data — not a real measurement" is visible.
2. **Bluetooth unavailable.** Tapping **Bluetooth sensor** does nothing.
3. **Connect and disconnect** work as before.
4. **Simulated set.** **Start simulated set** → **Recording**, with counts rising → **Stop set** → **Saving…** →
   **Set saved** → **New set**.
5. **Connection loss.** **Simulate connection loss** mid-set → **Error**, with "The sensor connection was lost … The N
   samples … were saved." The panel shows **Connection failed** and **Reconnect**. The next set reconnects.
6. **History.** The first row is fully visible below the "History" title (RO-028), and the sets are listed with their
   badge.
7. **Navigation and reload.** Back and swipe-back work; shake → Reload works. There is no red screen and no
   gesture/reanimated/worklets/TurboModule/"native module … not found" warning.

### B. Development build, no sensor yet (after the build route is decided)
1. **Install and start.** Install the development build (guide §4, steps 1–5) and run
   `npm run start:dev-build -w @repone/mobile`.
2. **Simulated regression.** Steps A3–A7 behave the same.
3. **Bluetooth without a sensor.** Tap **Bluetooth sensor**: it is selectable; the panel shows **Scan for sensors** and
   **No sensor chosen yet.**
   - **Connect** → **Connection failed** with "Choose a sensor first: tap Scan, then pick it from the list."
   - **Start set** → the same error, and **nothing is added to History**.
4. **Scan.** **Scan for sensors** → iOS asks for Bluetooth with "Allow RepOne to connect to your motion sensor over
   Bluetooth to record its readings."
   - Allow it → **Looking for sensors…** → the scan stops after about 10 s.
   - Nothing should be listed, since no sensor exists yet. A listed unrelated device is a bug.
5. **Permission denied.** Deny Bluetooth in Settings, then scan → "Bluetooth permission was denied. Allow it for this app
   in Settings."
6. **Bluetooth off.** Turn Bluetooth off in Control Centre, then scan → "Bluetooth is turned off. Turn it on in Settings
   or Control Centre."
7. **Back to simulated.** **Simulated** → **Start simulated set** works again.

### C. Real hardware (needs a chosen BLE board running the BLE firmware backend)
1. **Discovery.** The sensor appears in the scan list. Pick it and tap **Connect**: the panel shows
   `Sensor <serial> · firmware 0.1 · 50 Hz · 1 IMU`.
2. **First notification.** **Start set** → **Recording**, with the sample count rising about 50/s. This is the first
   BLE notification. The badge reads **Live sensor**, with the placeholder-calibration note.
3. **Link loss.** Power the sensor off mid-set → **Error** ("The Bluetooth connection to the sensor was lost" or "No
   data from the sensor for 1.0 s"), with the samples so far saved. Power it on and tap **Reconnect**, then start a new
   set.
4. **Range.** Walk out of range mid-set → the same as C3.
5. **Reset.** Reset the sensor mid-set (without disconnecting) → **Error**, "The sensor restarted its stream …".
6. **History.** The sets show the **Live sensor** badge.
7. **Not valid yet:** rep counts are meaningless until calibration exists. Check the sensor's values over USB (D)
   instead.

### D. Uno R3 USB bring-up (independent of the phone; RO-018)
After verifying the parts and their voltage, follow PR #27's checklist:
- set `IMU_DEVICE_SERIAL`, flash, and watch the serial monitor at 115200;
- check the `# imu ok` line, about 50 `S` lines per second, and plausible `#` readouts (gravity ≈ 9.8 m/s² on one
  axis; the gyro near 0 when still);
- the `E 2` path when the data wire is pulled;
- save about 30 s of output for offline decoding with the app's codec.

## 4. Owner decisions still needed

1. **Build route and cost** (guide §2):
   - **A.** EAS Build from Windows, which needs the paid Apple Developer Program and a free Expo account; check EAS's
     free allowance at expo.dev/pricing;
   - **B.** A Mac with Xcode: free 7-day signing.

   Nothing has been bought or enrolled.
2. **The iOS bundle identifier.** EAS asks for it on the first build; it is permanent for the installed app.
3. **The wireless board.** Spec §13 lists the required capabilities: BLE 4.2+ peripheral, MTU ≥ 31 (ideally ≥ 185),
   I²C, a unique ID, about 1 KB of buffer RAM, a maintained toolchain. Families that meet them: ESP32-S3/C3,
   nRF52840.
4. **ADR 0008:** accept it, change it, or keep it Proposed. Also the default rate: 50 Hz is proposed.
5. **RO-016** (Gemini) re-scope: review ADR 0008 against H0 evidence rather than design a competing format.
6. **Close PR #22** (the duplicate of #21).

## 5. Exact next steps

1. **Owner:** run acceptance **A** on the integration candidate and report pass/fail per step.
2. **Owner:** merge #24 when A passes. Merge #25 → #26 → #27 → #28 in order when satisfied, retargeting each.
3. **Owner, RO-018:** verify the Uno and GY-521 hardware, then run **D**.
4. **Owner:** decide the build route and the board (§4).
5. **Claude Code, after a board is chosen:** the BLE firmware backend (`firmware/ble/README.md`), then **B** and **C**
   with the owner.
6. **Not started:** the UI redesign. It must keep [`docs/ui/sensor-connection-interface.md`](../ui/sensor-connection-interface.md).
