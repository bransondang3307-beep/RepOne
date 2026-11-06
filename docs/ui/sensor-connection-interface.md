# UI interface: sensor selection, connection and live sets

> **Purpose.** This document is what a visual redesign (RO-014 or later) must preserve. It records:
> - the hooks and state the screens use;
> - the behaviour rules behind them;
> - the user-visible wording that the acceptance checklists and tests rely on.
>
> Restyle and rearrange freely, but keep these semantics. If wording changes, update the checklists in the RO-029
> completion handoff and the tests listed in §5.
>
> **State:** as of RO-029 part 3 (PR #28) and RO-028 (PR #24). Neither is merged yet.

## 1. Layering (enforced by `npm run check:boundaries`)

- **Screens** (`apps/mobile/app/`) and components use only the **feature hooks**:
  - `useDeviceConnection` (`src/features/device-connection`);
  - `useLiveSession` (`src/features/rep-tracking`);
  - `useWorkoutHistory` (`src/features/workouts`).

  They never import `src/application` internals, `src/infrastructure/*` or native modules.
- **The hooks** are thin Zustand adapters over application services: `AppContainer.sensors` (`SensorSelection`) and
  `WorkoutSessionController`. Business rules stay in those services and in `packages/`.
- **The BLE adapter** (`src/infrastructure/bluetooth`) is reached only by the composition root.

## 2. `useDeviceConnection(selector)`: sensor choice and connection

**State** (read-only):

| Field | Type | Meaning |
|---|---|---|
| `sensorKind` | `'simulated' \| 'ble'` | The user's explicit choice. It starts as `simulated` and changes only through `chooseSimulated()` / `chooseBle()` / `selectSensor()` |
| `bleSupport` | `'available' \| 'needs_development_build'` | `needs_development_build` in Expo Go: the BLE native module is absent |
| `transport` | `'simulated' \| 'ble' \| 'usb_serial'` | The current device's transport |
| `deviceId` | string | `simulated-device-01`, or `imu-<serial>` once a BLE sensor has identified itself (a placeholder before that) |
| `connectionState` | `'disconnected' \| 'connecting' \| 'connected' \| 'disconnecting' \| 'failed'` | Mirrors the current device |
| `error` | `{ code, message } \| null` | Why the connection is `failed`. Show `message` as is: it says what to do |
| `canSimulateConnectionLoss` | boolean | True only for the simulated device |
| `scanning` | boolean | A scan is running. It stops by itself after 10 s |
| `scanMessage` | string \| null | Why a scan could not run (Bluetooth off, permission denied …). Show it as is |
| `discovered` | `{ peripheralId, name, rssi }[]` | Sensors advertising the protocol's service UUID, each listed once per scan. **`name` is for display only**; it is never an identity |
| `selectedPeripheralId` | string \| null | The picked BLE sensor; null for simulated or before one is picked |
| `sensorSummary` | string \| null | The connected real sensor's own report: `Sensor <serial> · firmware x.y · N Hz · K IMU` |

**Actions:**

| Action | Behaviour |
|---|---|
| `connect()` | Connects the current device. **Never throws**: a failure shows as `connectionState: 'failed'` with `error` |
| `disconnect()` | Disconnects the current device; a no-op unless connected |
| `chooseSimulated()` | Switches to the simulated device. The previous device is disconnected first; any scan stops |
| `chooseBle()` | Switches to Bluetooth **without** a sensor: `connect()` then fails with "Choose a sensor first: tap Scan, then pick it from the list." **Rejects in Expo Go** |
| `scan()` / `stopScan()` | Scans for 10 s, filtering by the protocol's service UUID |
| `selectSensor(peripheralId)` | Picks a scanned sensor. **It does not connect**; Connect or Start set does |
| `simulateConnectionLoss()` | Test control. It acts only while the simulated device is chosen |

## 3. `useLiveSession(selector)`: recording a set

- **`session`** (a snapshot from `WorkoutSessionController`):
  - `status` (`idle · starting · recording · stopping · finished · error`);
  - `provenance` (`simulated · replay · sensor`; null when idle);
  - `fullReps`, `partialReps`, `samplesReceived`;
  - `error` (a plain message);
  - `sensorError`;
  - `sessionId`.
- **`startSet(machineLabel?)`:** connects the **chosen** device if needed, then records from its first channel.
  - It rejects with the connection's reason if the device cannot connect. Nothing is recorded then, and nothing
    falls back to simulation.
- **`stop()`, `dismissResult()`.**

## 4. Rules a redesign must keep

1. **The choice is explicit; nothing falls back.**
   - Simulated or Bluetooth is always the user's choice.
   - A real-sensor failure is shown, never replaced by simulated data.
   - Switching sensors disconnects the previous one.
2. **Expo Go.** When `bleSupport` is `needs_development_build`, the Bluetooth option is unavailable and the screen says
   why: "Real sensors need the development build; Expo Go runs the simulated sensor only."
3. **Locked while recording.** The sensor choice, Scan, picking a sensor and Connect/Disconnect are disabled while a set
   is `starting`, `recording` or `stopping` (today, the panel's `locked` prop). Connection changes mid-set are not
   allowed.
4. **Provenance is always visible and never truncated** (RO-023). The badge text is exactly:
   - "Simulated data — not a real measurement";
   - "Replayed recording";
   - "Live sensor".

   Before a set, the badge reflects the chosen sensor (`sensorKind === 'ble'` → Live sensor).
5. **Rep counts are labelled as unvalidated:**
   - "algorithm-derived counts, unvalidated on real hardware";
   - for real sensors also "Rep counts use a placeholder calibration: this sensor is not calibrated yet." This must
     stay until a real calibration flow exists.
6. **Messages are shown as given.** Show `error.message`, `scanMessage` and `session.error` verbatim; they are written
   to be actionable.
7. **The test control stays a test control.** "Simulate connection loss — Test control · simulated device only" appears
   only when `canSimulateConnectionLoss`, styled as a warning, and never for real sensors.
8. **Nothing connects by itself.** Scanning and picking don't connect; Connect or Start set does.
9. **Identity comes from the sensor:** show `sensorSummary` for identity. The advertised `name` and RSSI are only for
   choosing in the list.
10. **Nothing hides under the title bar** (RO-028). Scrolling screens keep their content below a translucent iOS header
    (`contentInsetAdjustmentBehavior="automatic"`, or equivalent safe-area handling).
11. **Accessibility.**
    - The sensor choice is a radio group (`accessibilityRole="radio"` with `selected`).
    - Actions are buttons with disabled state.
    - The test control keeps its accessibility label.
12. **Start-button wording:** "Start set" for a real sensor; "Start simulated set" for the simulated one.

## 5. Tests that guard this interface

- `src/features/device-connection/__tests__/deviceConnectionStore.test.ts`:
  - mirroring connection state;
  - failure reasons;
  - the test control for the simulated device only;
  - Expo Go (no BLE);
  - no fallback when Bluetooth has no sensor;
  - scan by service UUID; pick; the sensor's own identity;
  - Bluetooth off or denied messages;
  - switching sensors.
- `src/features/rep-tracking/__tests__/liveSessionStore.test.ts`:
  - simulated sets and connection loss;
  - a BLE set saved with `sensor` provenance and the sensor's `source_id`;
  - an unreachable sensor records nothing.
- `src/infrastructure/bluetooth/__tests__/*`: the adapter, against the shared contract suites and a fake central.
- `src/shared/components/__tests__/ProvenanceBadge.test.tsx` (RO-023) and
  `src/__tests__/routeScrollInsets.test.tsx` (RO-028, PR #24).

## 6. Wording relied on by acceptance checklists

| Area | Wording |
|---|---|
| Sensor choice | Simulated · Bluetooth sensor |
| Panel title and states | `Sensor: Simulated device` / `Sensor: Bluetooth sensor` · Not connected · Connecting… · Connected · Disconnecting… · Connection failed |
| Panel actions | Connect · Disconnect · Reconnect · Scan for sensors · Stop scanning |
| Scan states | Looking for sensors… · No sensor chosen yet. · `<name> / <rssi> dBm · chosen` |
| Test control | Simulate connection loss · Test control · simulated device only |
| Set status | Ready · Starting… · Recording · Saving… · Set saved · Error |
| Set actions | Start simulated set · Start set · Stop set · New set · View history |
| Notes | Real sensors need the development build; Expo Go runs the simulated sensor only. · Rep counts use a placeholder calibration: this sensor is not calibrated yet. |
