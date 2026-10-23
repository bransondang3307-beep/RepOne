# Handoff — RO-012 part 4: the app uses a (simulated) device connection

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-23 |
| **Task** | RO-012 (`TASKS.md`), Milestone 2, part 4 of 4 |
| **Branch** | `claude/RO-012-app-device`, **stacked on part 3** (PR #16) → part 2 (PR #15) → part 1 (PR #14) |
| **Commits** | see the PR's commit list |
| **Pull request** | opened against the part 3 branch (link recorded in a follow-up commit) |
| **Status** | implemented; verified locally (tests, typecheck, Expo exports); awaiting Codex review and the **owner's Expo Go check** |

## Objective
Wire ADR 0007 §4 into the app. Sessions get their sensor through a `DeviceConnection` (simulated for now), the
home screen shows the connection, and losing the connection mid-set ends the set honestly.

## What changed
- **Composition root (`apps/mobile/src/application/createAppContainer.ts`):**
  - `AppContainer.device` is a single-IMU `SimulatedDevice` (`simulated-device-01`, channel `simulated-imu-01`). Its
    script, rate and noise are the same as the previous demo sensor.
  - `getSessionSensor()` replaces `createSensor()`: it connects the device if needed and returns its channel's source.
  - `assembleContainer(repositories, clock, { scheduler, seed })` lets tests drive the device deterministically.
- **`features/rep-tracking`:** `startSimulatedSet()` takes its sensor from `getSessionSensor()`, so it connects
  automatically. The flow is still one tap: "Start simulated set".
- **New feature `features/device-connection`:**
  - a store that mirrors the device's state and failure reason. Its actions never throw; a failure shows as `failed`
    with the reason.
  - a `useDeviceConnection` hook, created once per container like `useLiveSession`.
  - `DeviceConnectionPanel`: "Sensor: Simulated device", the state (Not connected / Connecting… / Connected /
    Disconnecting… / Connection failed), the reason, and a Connect / Disconnect / Reconnect button. It is locked
    while a set records or saves.
- **Home route (`app/index.tsx`):** the panel sits above the set card. **No other UI changed.** The warning-badge row
  (RO-023, P3) is untouched.
- **Docs:** ADR 0007 §4 (app integration implemented); `docs/architecture.md` (module G, data flow); `TASKS.md`
  (RO-012 row and plan, PR #16 linked); this handoff.
- **Unchanged:** contracts, rep detection, units, the database schema and the provenance badge. All texts are
  brand-free.

## Files changed
- `apps/mobile/src/application/createAppContainer.ts` — modified
- `apps/mobile/src/features/rep-tracking/liveSessionStore.ts` and its `__tests__/liveSessionStore.test.ts` — modified
- `apps/mobile/src/features/device-connection/{index.ts,deviceConnectionStore.ts,useDeviceConnection.ts,components/DeviceConnectionPanel.tsx,__tests__/deviceConnectionStore.test.ts}` — added
- `apps/mobile/app/index.tsx` — modified (one import, one panel line)
- `docs/decisions/0007-…`, `docs/architecture.md`, `TASKS.md` — modified
- `docs/handoffs/2026-10-23-claude-RO-012-app-device.md` — added

## Tests and checks (exact results)
New and changed tests (all synthetic):

| Test | Asserts |
|---|---|
| The live-session store through the real composition root | Driven by a `ManualScheduler`; the recorded session has `source_id: simulated-imu-01` and `source_kind: simulated` |
| Starting a set | Connects the device |
| Connection loss after 5 s | The set ends in `error` (`connection_lost`, 250 samples saved), the device is `failed`, and the next set reconnects and records |
| `deviceConnectionStore` | Mirrors connect and disconnect; a refused connect shows `failed` with its reason without throwing; a lost connection shows its reason and clears on reconnect |

| Command | Result |
|---|---|
| `npm run verify` (Linux, Node 22.22.0) | exit 0. Boundaries OK (**70** files, no circular imports; the new feature follows the feature rules); workflow policy OK; typecheck OK; Jest **123/123**: mobile **28** (was 23), rep-engine 27, sensor-contracts 64, workout-domain 4 |
| `npm run test:scripts` | 62/62 |
| `npx expo export --platform android` / `ios` | both exit 0. Hermes bundles 2.8 MB / 2.4 MB |
| **Expo Go on a device** | **not run.** It needs the owner's phone (steps below) |

## Owner check in Expo Go (acceptance for Milestone 2's app part)
1. Check out the branch and run `npm ci`, then `cd apps/mobile && npx expo start`, and scan the QR code.
2. The home screen shows **"Sensor: Simulated device — Not connected"** above the set card.
3. Tap **Start simulated set**:
   - the panel turns **Connected**;
   - reps count up as before;
   - the yellow simulated-data badge is still shown.
4. **Stop set:** the set is saved and appears in History.
5. While idle, **Disconnect**, then **Connect**: the states change. The button is disabled while a set records.
6. Losing the connection mid-set can't be triggered on the phone without the optional control (see the question
   below); it is covered by tests.

## Decisions / ADRs
- ADR 0007 §4, app integration (Proposed). It auto-connects on "Start", to keep the one-tap flow.

## Known limitations / risks
- **Stacked.** Merge order is #14 → #15 → #16 → this PR.
- **Same demo stream each set.** The simulated device keeps one seed per app start, so sets in one session repeat the
  same synthetic stream. Before, each set got a new random seed. This is synthetic data either way; say if you want
  per-set variety back.
- **Single channel.** The app records one channel. Multi-channel recording in the app needs the Milestone 3 schema
  (the channel on rep events).
- **No real device.** USB and BLE adapters are future work under the same contract.

## Next steps
1. **Codex:** review the app wiring and the new feature.
2. **Owner:** the Expo Go check above; merge decisions in stack order.
3. After merges: a status follow-up marks RO-012 done once its criteria are verified.

## Questions for the owner
- Add a clearly labelled **"Simulate connection loss"** control (simulated device only), so the failure path can be
  checked on the phone?
- Do you want each set to vary again (a new seed per set) rather than per app start?
