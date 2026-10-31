# Handoff — RO-012 part 4: the app uses a (simulated) device connection

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-23 |
| **Task** | RO-012 (`TASKS.md`), Milestone 2, part 4 of 4 |
| **Branch** | `claude/RO-012-app-device`, **stacked on part 3** (PR #16) → part 2 (PR #15) → part 1 (PR #14). It contains every fix from those PRs (merge commits `9a3c219`, `9932487`, `fe39974`, `3cf3093`) |
| **Commits** | `e128124` part 4 · `afdf647` PR link · `9a3c219` merge of part 3's round 1 · `9932487` merge of part 3's round 2 · `39d0e7e` owner decisions · `fe39974` merge of part 3's round 3 · `0325874` handoff · `0d0b9cb` RO-023 badge fix · `3cf3093` merge of part 3's final round · then this handoff update (the final SHA is in PR #17) |
| **Pull request** | [PR #17](https://github.com/bransondang3307-beep/RepOne/pull/17), stacked: it targets `claude/RO-012-device-connection` until PR #16 merges |
| **Status** | implemented; verified locally (tests, typecheck, Expo exports); Codex review on the final commit; awaiting the **owner's Expo Go check** |

## Objective
Wire ADR 0007 §4 into the app. Sessions get their sensor through a `DeviceConnection` (simulated for now), the
home screen shows the connection, and losing the connection mid-set ends the set honestly. The owner's decisions of
2026-10-23 are also applied here.

## Owner decisions applied (2026-10-23)
1. **`source_id` stays the sensor identity, and distinct sensors cannot collide within a session.**
   - New `combineChannels(channels)` in `@repone/sensor-contracts`:
     - it throws `ChannelCollisionError` if two channels share a `source_id`, before anything is recorded. That
       covers two devices with the same id, and the same device combined twice;
     - it drops and counts any sample that arrives on one channel carrying another `source_id`.
   - `getSessionSensor()` checks the device's channels with it before every set.
   - The two-IMU end-to-end test (rep-engine) records through it.
   - ADR 0007 §2 and `docs/hardware-protocol.md` §1 and §4 record the rule, and that adapters derive `source_id` from
     something unique to the physical sensor.
2. **A "Simulate connection loss" test control, for the simulated device only.**
   - `AppContainer.simulateConnectionLoss` is set only for the simulated device (`null` for real devices).
   - The store exposes `canSimulateConnectionLoss`, and the panel shows a dashed, yellow control: **"Simulate
     connection loss — Test control · simulated device only"**.
   - It is enabled whenever the device is connected, mid-set included.
   - The resulting message reads "…(connection loss simulated from the app)…".
3. **The synthetic motion stays repeatable:** one seed per app start, so sets in one run repeat the same stream.

## What changed (part 4 overall)
- **Composition root:**
  - `AppContainer.device` is a single-IMU `SimulatedDevice` (`simulated-device-01`, channel `simulated-imu-01`), with
    the same script, rate and noise as the previous demo sensor.
  - `getSessionSensor()` connects it if needed, checks its channels, and returns the channel's source.
  - `simulateConnectionLoss` is the test hook.
  - `assembleContainer(…, { scheduler, seed })` lets tests drive the device.
- **`features/rep-tracking`:** starting a set connects automatically, so it is still one tap.
- **`features/device-connection` (new):** a store and hook that mirror the device's state and reason (actions never
  throw), and `DeviceConnectionPanel` with the transport, state, reason, Connect / Disconnect / Reconnect (locked
  while a set records) and the test control.
- **Home route:** the panel sits above the set card. The status row wraps (RO-023, below). No other UI changed.
- **`@repone/sensor-contracts`:** `combineChannels`, `ChannelCollisionError`, `SessionChannels` (new `src/channels.ts`).
- **Unchanged:** the rep detection algorithm, units, the database schema and the provenance badge. All texts are
  brand-free.

## Tests and checks (exact results, final commit)
| Test / command | Result |
|---|---|
| `combineChannels` (4 tests) | pass. Rejects colliding devices (nothing started), the same device twice, and empty input. Combines distinct devices (50 + 50 samples, each under its own id). Drops and counts a mislabelling channel's samples |
| Live-session store through the real composition root | pass. Normal set; auto-connect; loss via the **app's** test hook ends the set in `error` with the exact message (250 samples saved); the next set reconnects |
| `deviceConnectionStore` (4 tests) | pass. Includes "test control only when provided; no-op for a real device" |
| `npm run verify` (Linux, Node 22.22.0), with part 3's final round and the RO-023 fix | exit 0. Boundaries OK (74 files, no circular imports); workflow policy OK; typecheck OK; Jest **165/165**: mobile 31, rep-engine 27, sensor-contracts 103, workout-domain 4 |
| `npm run test:scripts` | 62/62 |
| `npx expo export --platform android` / `ios` | both exit 0. Hermes bundles 2.8 MB / 2.4 MB |
| **Expo Go on a device** | **owner**: steps below |

## RO-023 fix: simulated-data badge no longer runs off screen (owner request, 2026-10-23)
The owner's Expo Go screenshot showed the yellow badge clipped at the right edge, so the owner asked for the fix
here. It is in separate `RO-023:` commits; its task row lives in PR #13.
- **The badge** (`ProvenanceBadge`, shared by the home and History screens): it gets `flexShrink: 1` and
  `maxWidth: '100%'`, so it never grows past its container and its text wraps instead. It is a rounded rectangle
  (radius 12, not a pill) so it still reads as a badge on two lines. There is no truncation, and the colours are
  unchanged: simulated and replay data stay distinct from live sensor data.
- **The home status row** gets `flexWrap: 'wrap'`, and the status text no longer shrinks. When "Recording" and the
  badge don't fit on one line, the badge moves to its own line below.
- **Test:** `ProvenanceBadge.test.tsx`, a regression test for this layout rule (shrinkable, capped at 100%, no
  `numberOfLines` or ellipsis, full label) and for the colour distinction. Jest has no layout engine, so the visual
  result is confirmed on the phone (checklist step 2). Against the old badge the first test fails (negative control).

## Owner check in Expo Go
**Launch** on the Windows laptop, in a *new* folder. Leave `C:\Users\Admin\Documents\RepOne`, Antigravity's checkout,
untouched.

```powershell
cd C:\Users\Admin\Documents
git clone https://github.com/bransondang3307-beep/RepOne.git RepOne-m2-check
cd RepOne-m2-check
git switch claude/RO-012-app-device
git log -1 --format=%H        # must print the final commit SHA given in PR #17
npm ci                        # if PowerShell blocks npm scripts, use npm.cmd ci
cd apps\mobile
npx expo start                # npx.cmd expo start if needed
```

- Use Node 22 or 24; you have v24.
- The iPhone and the laptop must be on the same Wi-Fi.
- Scan the QR code with the iPhone **Camera** app; it opens in **Expo Go**, which must be up to date for SDK 57.
- If the phone can't reach the laptop, stop the server and run `npx expo start --tunnel`. It may offer to install
  `@expo/ngrok`, which is free.

**Checklist** (all data is simulated):
1. **Start screen.** The panel shows "Sensor: Simulated device · Not connected", plus the dimmed yellow "Simulate
   connection loss · Test control · simulated device only".
2. **Normal recording.**
   - Optionally type a machine label, then tap **Start simulated set**.
   - The panel turns **Connected**, the status reads **Recording**, reps count up, and the yellow "Simulated data"
     badge is visible. **Check RO-023:** the badge's whole text "Simulated data — not a real measurement" is
     visible, either beside "Recording" or on its own line below it, never running off the screen.
   - After about 20 s tap **Stop set**: the status reads **Set saved**.
3. **History.** Tap **View history**: the set is listed with its label and rep counts. Go back.
4. **Idle disconnect and reconnect.**
   - Tap **New set**, then **Disconnect**: the panel reads Not connected.
   - Tap **Connect**: it reads Connected.
   - While a set records, Connect/Disconnect is disabled.
5. **Mid-set connection loss.**
   - Tap **Start simulated set**. After a few reps tap **Simulate connection loss**.
   - The status reads **Error**, with "The sensor connection was lost (connection loss simulated from the app). The N
     samples received before the failure were saved."
   - The panel reads **Connection failed**, with the reason and **Reconnect**.
   - **History** lists this partial set with the reps counted before the loss.
6. **Another set afterwards.**
   - Tap **New set**, then **Start simulated set**: the panel reconnects by itself and reps count again.
   - **Stop set**: it is saved.
   - With the repeatable demo stream, the reps follow the same pattern as the first set; that is expected.

Report any step that differs (a screenshot helps), especially steps 5 and 6.

## Decisions / ADRs
- ADR 0007 §2 (owner decision: `source_id` identity, no collisions) and §4 (app integration, test control,
  repeatable stream). Proposed until merged.

## Known limitations / risks
- **Stacked.** Merge order is #14 → #15 → #16 → #17. Each is retargeted to `main` as the one below merges.
- **Single channel in the app.** The app records one channel. Multi-channel recording needs Milestone 3's schema
  (the channel on rep events); the collision rule is already enforced at the session boundary.
- **Simulator only.** No real device; USB and BLE adapters are future work under the same contracts.

## Next steps
1. **Codex:** the final review of PR #17's head.
2. **Owner:** the Expo Go check above; then merge decisions in stack order.
3. After the merges: a status follow-up marks RO-012 done once its criteria are verified.

## Questions for the owner
- none (the three decisions of 2026-10-23 are applied)
