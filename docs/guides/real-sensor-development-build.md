# Real sensor on an iPhone: development build (RO-029)

> **Status: prepared, not yet done.**
> - The BLE adapter, the native configuration and the build profile are in the repository.
> - No development build has been made.
> - No iPhone has connected to a sensor over Bluetooth yet.
> - No wireless sensor board has been chosen.

## 1. Expo Go vs development build

| | **Expo Go** (what you use today) | **Development build** (needed for a real sensor) |
|---|---|---|
| Simulated sensor | ✅ | ✅ |
| Real Bluetooth sensor | ❌ Expo Go cannot load the BLE native module, so the *Bluetooth sensor* choice is disabled with a note | ✅ (`react-native-ble-manager` 12.6.1 and its config plugin) |
| How to start the dev server | `npm run start:go -w @repone/mobile` (`npx expo start --go`) | `npm run start:dev-build -w @repone/mobile` (`npx expo start --dev-client`) |
| Native library versions | Expo Go's own (older gesture, animation and worklets libraries; RO-027 handoff) | Exactly the app's |

**Expo Go users, note:** because `expo-dev-client` is now installed, a plain `npx expo start` opens in
development-build mode. Use **`npx expo start --go`** (or press `s` in the terminal) to get the Expo Go QR code.

## 2. What a development build of an iPhone app requires

- **Signing.** iOS installs only signed apps. Expo's documentation says every build that runs on an iPhone needs a
  **paid Apple Developer Program membership** for signing.
  - The only exception is a local build on a **Mac with Xcode**, which can sign with a free Apple ID: the app expires
    after 7 days and must be rebuilt.
  - Sources: Expo, "Create a development build"; Expo, "iOS development build for devices". This environment cannot
    reach expo.dev, so check those pages for current wording.
- **From Windows (no Mac):** use **EAS Build** (Expo's cloud build service), which builds and signs the app on Expo's
  servers.
  - It needs a free Expo account and the paid Apple Developer membership.
  - EAS has a free plan with a monthly build allowance. I could not verify the current numbers from here; check
    `expo.dev/pricing` before you rely on it.
- **Costs to decide on (nothing has been bought or enrolled):**

  | Route | Needs | Cost |
  |---|---|---|
  | A. EAS Build from Windows | Expo account (free), Apple Developer Program | Apple: paid annual membership (check developer.apple.com); EAS: free plan allowance, or a paid plan |
  | B. Local build on a Mac | A Mac with Xcode, a free Apple ID | $0 if you have a Mac; the app expires after 7 days |
  | C. Android phone instead (not your setup) | Any Android phone, EAS or local Android build | $0 signing; not tested |

- **Owner decision needed:**
  - **The route** (A or B).
  - **A bundle identifier,** e.g. `com.<you>.<app>`. EAS asks for it on the first build and writes it to
    `apps/mobile/app.json`. It is permanent for the installed app, so pick it deliberately. Under ADR 0006 it should
    not need to change if the product is renamed.

## 3. What is already configured

- **`apps/mobile/app.json`:**
  - plugin `react-native-ble-manager`, which adds the iOS permission text "Allow $(PRODUCT_NAME) to connect to your
    motion sensor over Bluetooth to record its readings.";
  - the Android BLE permissions, with `neverForLocation`.

  It was verified here with `expo prebuild` and a placeholder bundle id, then discarded. Native folders are generated,
  never committed.
- **`apps/mobile/eas.json`:** a `development` profile (development client, internal distribution, a device build).
- **`expo-dev-client` ~57.0.20.** It matches Expo SDK 57.

## 4. Steps to the first BLE notification on the iPhone (route A)

**Prerequisites:**
- a BLE sensor board running the BLE firmware backend (`firmware/ble/README.md`; it does not exist until a board is
  chosen);
- the paid Apple Developer membership;
- a free Expo account.

1. On the Windows laptop, in the repository:
   - `npm ci`
   - `npx eas-cli login`
2. `cd apps/mobile`, then `npx eas-cli device:create`. Open the link it shows on the iPhone and install the profile,
   which registers the iPhone for internal builds.
3. `npx eas-cli build --profile development --platform ios`.
   - Sign in with the Apple ID when asked; let EAS manage the certificates.
   - Choose the bundle identifier.
4. When the build finishes, open its install link on the iPhone and install the app. On iOS 16+, enable
   **Settings → Privacy & Security → Developer Mode** if iOS asks.
5. On the laptop: `npm run start:dev-build -w @repone/mobile`. Open the new app on the iPhone and connect it to the
   dev server (same Wi-Fi, or `--tunnel`).
6. In the app:
   - choose **Bluetooth sensor**, then **Scan for sensors**;
   - allow Bluetooth when iOS asks;
   - pick the sensor, then **Connect**.

   The panel shows `Sensor <serial> · firmware 0.1 · 50 Hz · 1 IMU`.
7. Tap **Start set**: the sample count rises about 50 per second. **That is the first BLE notification decoded on the
   phone.**
   - The badge reads **Live sensor**.
   - Rep counts are algorithmic and use a placeholder calibration, so they mean nothing yet.

Later builds are only needed when native code or configuration changes. JavaScript changes load from the dev server.

## 5. What the tests do and do not show

- **Shown, in Jest, without hardware:**
  - the adapter's connection and stream behaviour, against a fake BLE central with synthetic packets, including both
    shared contract suites;
  - the native binding's data mapping, with the BLE module mocked;
  - an end-to-end set from the fake sensor saved with `sensor` provenance and the sensor's own `source_id`.
- **Not shown:** any real radio, iPhone, CoreBluetooth behaviour (timing, MTU, permissions) or real sensor. Those
  need steps 1–7 with real hardware.
