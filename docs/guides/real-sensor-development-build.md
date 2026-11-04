# Real sensor on an iPhone: development build (RO-029)

> **Status: prepared, not yet done.**
> - The BLE adapter, the native configuration and the build profile are in the repository.
> - No development build has been made.
> - No iPhone has connected to a sensor over Bluetooth yet.
> - No wireless sensor board has been identified. The HC-05, HC-06 and JDY-31 are Bluetooth Classic (SPP) modules,
>   which an iPhone app cannot use.

## 1. Expo Go vs development build

| | **Expo Go** (what you use today) | **Development build** (needed for a real sensor) |
|---|---|---|
| Simulated sensor | ✅ | ✅ |
| Real Bluetooth sensor | ❌ Expo Go cannot load the BLE native module, so the *Bluetooth sensor* choice is disabled with a note | ✅ (`react-native-ble-manager` 12.6.1 and its config plugin) |
| How to start the dev server | `npm run start:go -w @repone/mobile` (`npx expo start --go`) | `npm run start:dev-build -w @repone/mobile` (`npx expo start --dev-client`) |
| Native library versions | Expo Go's own (older gesture, animation and worklets libraries; RO-027 handoff) | Exactly the app's |

**Expo Go users, note:** because `expo-dev-client` is now installed, a plain `npx expo start` opens in
development-build mode. Use **`npx expo start --go`** (or press `s` in the terminal) to get the Expo Go QR code.

## 2. Build routes, requirements and costs

**Signing.** iOS installs only signed apps.
- **EAS Build** (Expo's cloud build) signs with a **paid Apple Developer Program** membership.
- **A local build on a Mac with Xcode** can sign with a **free Apple ID** (a "Personal Team"). Its limits:
  - the app's provisioning expires **7 days** after it is issued, and you then rebuild and reinstall it;
  - Apple's account help lists **up to 3 apps per device** under free provisioning.
- **Sources** (searched 2026-11-04; this environment cannot open docs.expo.dev or expo.dev, so check them before relying
  on exact numbers):
  - Expo's SDK reference table: SDK 58 needs **iOS 16.4+** and **Xcode 26.4+**;
  - Apple Developer Account Help, "Compare memberships";
  - Expo, "Create a development build" and "iOS development build for devices".

| Route | Needs | Cost | Status |
|---|---|---|---|
| **B. Local build on a Mac (recommended for the owner)** | A Mac with Xcode 26.4+, a free Apple ID, a USB cable, iPhone on iOS 16.4+ with Developer Mode | **$0**; rebuild every 7 days | Owner has a Mac and no paid membership: **this route** |
| A. EAS Build | Free Expo account **and** paid Apple Developer Program | Apple's annual fee; EAS free-plan allowance (check expo.dev/pricing) | Not chosen: needs a paid membership |
| C. Android phone | Android phone, Android SDK or EAS | $0 signing | Not the owner's setup; untested |

**Owner decision still needed: the bundle identifier.** It is written to `apps/mobile/app.json` as
`ios.bundleIdentifier`. It is permanent for the installed app. Under ADR 0006 a new technical identifier is
brand-neutral; the proposal is `io.github.bransondang3307.motiontracker`. Nothing in the repository sets it until it
is confirmed.

## 3. What is already configured

- **`apps/mobile/app.json`:**
  - plugin `react-native-ble-manager`, which adds the iOS permission text "Allow $(PRODUCT_NAME) to connect to your
    motion sensor over Bluetooth to record its readings.";
  - the Android BLE permissions, with `neverForLocation`.

  It was verified here with `expo prebuild` and a placeholder bundle id, then discarded. Native folders are generated
  and git-ignored, never committed.
- **`expo-dev-client` ~58.0.18**, as Expo SDK 58's module list specifies; `react-native-ble-manager` 12.6.1.
  - React Native 0.88.1's codegen generates its TurboModule spec for iOS and Android.
  - Every spec method has a native implementation. On iOS, the event emitters come from the generated base class.
  - **No native compile has run:** there is no Xcode here, and the Android SDK host is blocked. The first native
    build is step 5 below.
- **`apps/mobile/eas.json`:** a `development` profile, used only by route A.

## 4. Steps to the first BLE notification on the iPhone (route B: Mac, free Apple ID)

**Prerequisites:**
- a BLE sensor board running the BLE firmware backend (`firmware/ble/README.md`). It does not exist until the board is
  identified. Without it, steps 1–6 still give acceptance **B** (development build, no sensor);
- the bundle identifier confirmed and committed (§2).

1. **On the Mac:**
   - install **Xcode 26.4 or later** from the App Store, open it once and let it install the iOS platform;
   - install **Node.js 22 LTS**;
   - when `expo run:ios` first needs CocoaPods, Expo CLI offers to install it.
2. **Apple ID.** In Xcode, open **Settings → Accounts → +** and add your Apple ID (a free one works). It appears as
   "<your name> (Personal Team)". Never paste the password anywhere else.
3. **The repository**, in Terminal, at the candidate commit posted on PR #28:
   ```bash
   git clone https://github.com/bransondang3307-beep/RepOne.git RepOne-device
   cd RepOne-device
   git switch --detach <candidate SHA>
   npm ci
   ```
4. **The iPhone.** Connect it by USB, unlock it and tap **Trust**. Then turn on **Settings → Privacy & Security →
   Developer Mode** and restart when asked (iOS 16+).
5. **Build and install:**
   ```bash
   cd apps/mobile
   npx expo run:ios --device
   ```
   Pick your iPhone from the list.
   - **If signing fails** ("No profiles" or "requires a development team"):
     1. run `xed ios` to open the generated project;
     2. select the app target, then **Signing & Capabilities**;
     3. tick **Automatically manage signing**, then set **Team** to your Personal Team;
     4. run the command again.
   - **On the first launch,** if iOS refuses to open the app, go to **Settings → General → VPN & Device Management**,
     choose your Apple ID and tap **Trust**.
6. **Later sessions:** run `npm run start:dev-build -w @repone/mobile` and open the installed app. It loads the
   JavaScript from the Mac, on the same Wi-Fi.
   - Rebuild (step 5) only when native code or configuration changes, or **every 7 days**, when the free profile
     expires.
7. **In the app, on the Record tab:**
   - choose **Bluetooth sensor**, then **Scan for sensors**, and allow Bluetooth when iOS asks;
   - pick the sensor, then tap **Connect**. The panel shows `Sensor <serial> · firmware 0.1 · 50 Hz · 1 IMU`.
8. **Tap Start set:** the sample count rises about 50 per second. **That is the first BLE notification decoded on the
   phone.**
   - The badge reads **Live sensor**.
   - Rep counts use a placeholder calibration, so they mean nothing yet. Streaming is not rep-counting accuracy.

## 5. What the tests do and do not show

- **Shown, in Jest, without hardware:**
  - the adapter's connection and stream behaviour, against a fake BLE central with synthetic packets, including both
    shared contract suites;
  - the native binding's data mapping, with the BLE module mocked;
  - an end-to-end set from the fake sensor saved with `sensor` provenance and the sensor's own `source_id`.
- **Not shown:** any real radio, iPhone, CoreBluetooth behaviour (timing, MTU, permissions) or real sensor. Those
  need §4 with real hardware.
