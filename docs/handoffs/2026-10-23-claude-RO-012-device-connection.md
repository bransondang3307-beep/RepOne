# Handoff — RO-012 part 3: device connection contract and simulated device

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-23 |
| **Task** | RO-012 (`TASKS.md`), Milestone 2, part 3 of 4 |
| **Branch** | `claude/RO-012-device-connection`, **stacked on part 2** (`claude/RO-012-channel-rep-engine`, PR #15), which is stacked on part 1 (PR #14) |
| **Commits** | see the PR's commit list |
| **Pull request** | opened against the part 2 branch (link recorded in a follow-up commit) |
| **Status** | implemented; verified locally; awaiting Codex review. Merge after PRs #14 and #15 |

## Objective
Add Module G's contract from ADR 0007 §4: a `DeviceConnection` the app can connect to, a multi-channel simulated
device, and a shared contract suite that future USB-serial and BLE adapters must pass. This adds no native
dependencies and does not claim hardware support.

## What changed
- **`@repone/sensor-contracts`: new `src/device.ts`** (contract change, ADR 0007 §4):
  - `DeviceConnection`: `deviceId`, `transport`, `getState()`, `getLastError()`, `subscribeState()`, `connect()`,
    `disconnect()` and `getChannels()`.
  - `ConnectionState`: `disconnected | connecting | connected | disconnecting | failed`.
  - `ConnectionError` codes: `unavailable`, `timeout`, `connection_lost`, `unknown`.
  - `DeviceConnectError`, and `DeviceChannel { source_id, source }`.
  - The rules are documented on the interface:
    - `connect()` is idempotent and returns the pending attempt.
    - `disconnect()` waits for a pending connect and stops every channel.
    - Channels are offered only while connected. A channel's `start()` rejects with `start_failed` while disconnected.
    - A lost link fails every streaming channel with `connection_lost` before the device publishes `failed`.
- **ADR 0007 decision 2, refined.** A device exposes **one `SensorSource` per channel**, so `SensorSource` and its
  ordering guarantee stay unchanged.
- **`SimulatedDevice`** (Module B) offers:
  - synthetic channels, each with an optional per-channel `fault`;
  - an optional `connectDelayMs`;
  - `refuseConnect`, on every attempt or on the first N;
  - `simulateConnectionLoss()`.

  Each channel wraps a `SimulatedSensorSource`, so its stream is exactly `generateTrace` for its script (tested).
- **`describeDeviceConnectionContract`** (new, in `@repone/sensor-contracts/testing`) covers:
  - initial state;
  - connect, and channels that stream their own `source_id`;
  - idempotent connect;
  - disconnect while streaming, and when never connected;
  - refusing to start a channel while disconnected, then streaming again after reconnecting;
  - disconnect during a pending connect;
  - state-listener unsubscription;
  - connection loss and recovery, and refused connects (both opt-in).
- **Docs:**
  - ADR 0007: decisions 2 and 4 updated; status.
  - `docs/architecture.md`: modules B and G; contract suites.
  - `docs/hardware-protocol.md`: §3, the device contract for future BLE and serial adapters, with the connection
    error codes.
  - `TASKS.md`: the RO-012 row and plan, with PR #15 linked.
- **Unchanged:** the app (part 4), rep detection, units, `SensorSource`, `RepEvent` and the database schema.

## Files changed
- `packages/sensor-contracts/src/device.ts` — added
- `packages/sensor-contracts/src/simulation/SimulatedDevice.ts` — added
- `packages/sensor-contracts/src/testing/deviceConnectionContract.ts` — added
- `packages/sensor-contracts/src/index.ts`, `src/testing/index.ts` — modified
- `packages/sensor-contracts/test/simulatedDevice.test.ts` — added
- `packages/rep-engine/test/deviceChannels.test.ts` — added
- `docs/decisions/0007-…`, `docs/architecture.md`, `docs/hardware-protocol.md`, `TASKS.md` — modified
- `docs/handoffs/2026-10-23-claude-RO-012-device-connection.md` — added

## Tests and checks (exact results)
New tests (all synthetic):
- **Device contract suite**, run twice: once with an instant connect and once with a 200 ms connect, each including
  the connection-loss and refused-connect tests.
- **Sensor contract suite** on a device channel, including a channel fault and a start while disconnected.
- **Device-specific tests:**
  - each channel's stream equals `generateTrace`;
  - a fault on one channel leaves the other channel and the connection untouched;
  - connection loss fails only the streaming channels;
  - `refuseConnect.attempts` lets a later attempt succeed;
  - constructor validation.
- **rep-engine integration:**
  - a two-IMU simulated device streaming live into `MultiChannelRepDetector` gives each channel exactly its solo
    detection (8 full on A; 2 reps on B);
  - with channel A failing after 250 samples, B is unchanged.

| Command | Result |
|---|---|
| `npm run verify` (Linux, Node 22.22.0) | exit 0. Boundaries OK (65 files, no circular imports); workflow policy OK; typecheck OK; Jest **118/118**: mobile 23, rep-engine **27** (was 25), sensor-contracts **64** (was 31), workout-domain 4 |
| `npm run test:scripts` | tests 62, pass 62, fail 0 |
| Expo export | not re-run: no app code changed in part 3 (the last exports, after part 1's fix, passed) |

Negative controls (run, then reverted): each of five `SimulatedDevice` mutations fails its intended contract tests.

| Mutation | Tests failing |
|---|---|
| `disconnect()` does not stop channels | 2 |
| The reason is set after `failed` is published | 2 |
| A channel starts while disconnected | 3 |
| Channels are offered while disconnected | 8 |
| Connection loss leaves channels streaming | 3 |

## Decisions / ADRs
- ADR 0007 decisions 2 and 4 (Proposed), refined: one `SensorSource` per channel instead of multi-channel sources.

## Known limitations / risks
- **Stacked.** Merge order is #14 → #15 → this PR. Each is retargeted to `main` as the one below merges.
- **Simulator only.** No real transport exists, and timing on hardware (connect latency, loss detection) is unknown.
- **Connection-loss detection.** A real adapter must notice silence itself (a watchdog → `stream_timeout` or
  `connection_lost`); the simulator triggers loss on demand.
- **Not wired into the app yet.** That is part 4.

## Next steps
1. **Codex:** review the contract and the suite.
2. **Claude Code:** part 4, app integration:
   - the composition root takes the session's sensor from a `SimulatedDevice` channel;
   - a `features/device-connection` view (connect, disconnect, state, reason);
   - losing the connection mid-set ends the set in `error` (part 1's path).

   The owner then checks it in Expo Go.

## Questions for the owner
- Part 4 adds a small connection panel to the home screen, which changes the UI. Shall I also include a "Simulate
  connection loss" control, clearly labelled as simulated, so the failure path can be checked in Expo Go? It would
  be shown only for the simulated device.
