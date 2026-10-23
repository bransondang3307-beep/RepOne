# Handoff — RO-012 part 3: device connection contract and simulated device

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-23 |
| **Task** | RO-012 (`TASKS.md`), Milestone 2, part 3 of 4 |
| **Branch** | `claude/RO-012-device-connection`, **stacked on part 2** (`claude/RO-012-channel-rep-engine`, PR #15), which is stacked on part 1 (PR #14) |
| **Commits** | `038d3f9` RO-012: DeviceConnection contract, SimulatedDevice and device contract suite (part 3) · then a commit recording the PR link |
| **Pull request** | [PR #16](https://github.com/bransondang3307-beep/RepOne/pull/16), stacked: it targets `claude/RO-012-channel-rep-engine` until PR #15 merges |
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

## Review round 1 (Codex, 2026-10-23, on `a06f28c`)
Codex found three P1s and one P2. I reproduced each one with a test first and fixed all of them in one commit (SHA in
the PR replies).

| Finding | Reproduced (before the fix) | Fix |
|---|---|---|
| **P1:** connection loss while a channel `start()` is pending leaves the channel streaming (`SimulatedDevice.ts:183`) | New device-suite test fails on both harnesses | The channel tracks its in-flight start (`starting`, `generation`). A loss fails it: `start()` rejects with `connection_lost`, the inner source is released, and no samples arrive. A `stop()` cancels a pending start quietly (new test) |
| **P1:** remaining batch samples are delivered after a failure (`:166`) | New device-suite test: a sample listener triggering loss got further samples. The same defect affected `stop()` from a listener in `SimulatedSensorSource` and `ReplaySensorSource` (new sensor-suite test; 4 sources failed) | The channel forwards samples only while streaming. The simulated and replay batch loops exit once their run has ended |
| **P1:** `connecting` was published before the pending attempt was installed (`:84`) | New device-suite test: a `disconnect()` from the `connecting` listener was ignored and the device stayed connected | The attempt promise is created and installed before `connecting` is published, on both the instant and the delayed path |
| **P2:** the loss test did not check that channels fail before the device (`deviceConnectionContract.ts:174`) | The ordering was right but untested | Every channel's status and reason are captured inside the device's `failed` callback. Reversing the order now fails the test (negative control) |

Negative controls (each re-introduces one defect, then reverted). Each fails its intended tests:

| Defect re-introduced | Tests failing |
|---|---|
| Device fails before its channels | 2 |
| `connecting` published before the attempt is installed | 2 |
| Loss ignores a pending start | 2 |
| Both batch guards removed | 5 |

After the fix, `npm run verify` exits 0: Jest **129/129** (mobile 23, rep-engine 27, sensor-contracts **75**, was 64;
workout-domain 4) and script tests 62/62.

## Review round 2 (Codex, 2026-10-23, on `86e7f17`). This is the last allowed fix round
Codex found two new P1s, both re-entrant calls from listeners during a transition. I reproduced each with a
contract test first and fixed both in one commit (SHA in the PR replies).

| Finding | Reproduced (before the fix) | Fix |
|---|---|---|
| **P1:** a channel restarted from its own `error` listener during a connection loss ends up streaming on a failed device (`SimulatedDevice.ts:225`) | New device-suite test fails on both harnesses | Two layers. (1) The device counts as not connected from the moment the link drops (`dropping`), so the retry is refused. (2) A channel start re-checks the connection before publishing `streaming`, and fails with `connection_lost` instead |
| **P1:** `disconnecting` was published before the disconnect was installed (`:117`) | New device-suite test: a `connect()` from the `disconnecting` listener resolved, yet the device ended `disconnected` | The disconnect operation is installed before `disconnecting` is published, so a listener's `connect()` waits for it. States: `disconnecting → disconnected → connecting → connected` |

Negative controls (each defect re-introduced, then reverted):
- **Both loss guards removed:** the restart test fails on 2 harnesses. Either guard alone is enough.
- **`disconnecting` published first:** the reconnect test fails on 2 harnesses.

sensor-contracts tests: 75 → **79**.

## Review round 3 (owner-approved third round, 2026-10-23, on `3288d5c`)
After round 2, Codex found one more P1. I stopped and reported it, and the owner approved a third fix round. Because
it was the third listener re-entrancy finding, this round also audits that whole class, not just the reported case.

**The finding.**
- **What Codex found** (`SimulatedDevice.ts:236`): an old `stop()` overwrote a channel that its own `stopped`
  listener had restarted.
- **Reproduced:** the new sensor-suite test 'stays streaming when a `stopped` listener restarts it' failed on the
  device channel. It ended `stopped` with a live timer and no samples.
- **Fix:** `stop()` takes its own generation and publishes `stopped` only if no newer run started meanwhile.

**Found by the audit: listeners could see events out of order.**
- **What was wrong:** status and state changes made by a listener were delivered *nested*. Later listeners therefore
  saw events out of order, e.g. `streaming, streaming, stopped` for `stopped → streaming`.
- **Reproduced with two new tests:** sensor suite, failing on the simulated, looping and replay sources; device suite,
  failing on both harnesses.
- **Fix:** `BaseSensorSource` and `SimulatedDevice` queue changes made during delivery, so every listener sees them
  in order. `getStatus()` / `getState()` return the latest. The contract docs state this.

**Audit of every async continuation in `SimulatedDevice`:**

| Continuation | Guard |
|---|---|
| Channel `start()` | Generation check, plus a connection re-check (rounds 1–2) |
| Channel `stop()` | Generation check (this round) |
| `interrupt()` | Synchronous: bumps the generation, fails, releases the inner source |
| `connect()` | Attempt installed before `connecting`; `disconnect()` waits for it (round 1) |
| `disconnect()` | Re-checks `closing` and the state after awaiting a pending connect; installed before `disconnecting` (round 2) |
| Loss | `dropping` refuses restarts until `failed` (round 2) |
| Nested listener calls | Ordered delivery (this round) |

**Negative controls** (each defect re-introduced, then reverted). Each fails its intended tests:

| Defect re-introduced | Tests failing |
|---|---|
| `stop()` without its generation guard | 1 |
| Sensor statuses delivered nested | 3 |
| Device states delivered nested | 2 |

`npm run verify` exits 0. Jest **143/143**: mobile 23, rep-engine 27, sensor-contracts **89** (was 79), workout-domain
4. Script tests 62/62.

## Final review round (owner-approved fourth round, 2026-10-23, on `343f519`)
Codex's review of round 3 found one P1 and one P2. I reproduced both and stopped; the owner approved one final round.
**Exit rule:** after this round, only new P0 or P1 findings come back to the owner; P2 or P3 findings become
follow-up tasks.

| Finding | Reproduced (before the fix) | Fix |
|---|---|---|
| **P1:** a reconnect requested from a channel's `error` listener during a connection loss was a no-op, and the device stayed `failed` (`SimulatedDevice.ts:85`) | New device-suite test fails on both harnesses | `connect()` waits while a loss is being published (`lossPublished`), then makes a real attempt. Same class: `disconnect()` in that window waits and is a no-op on the failed device (new test) |
| **P2:** a listener that throws stopped delivery to later listeners and stranded queued changes (`BaseSensorSource.ts:70`, same in `SimulatedDevice.setState`) | New sensor-suite test fails on all 4 sources; new device-suite test fails on both harnesses. In the reproduction the second listener saw only `["streaming"]` | **Listener isolation** (`src/listeners.ts`). Every sample, status and state listener call is wrapped: a failure is reported with `console.error` and delivery continues, so the queue always drains. A listener's failure no longer fails `start()` / `stop()` / `connect()` |

Negative controls (each defect re-introduced, then reverted). Each fails its intended tests:

| Defect re-introduced | Tests failing |
|---|---|
| Status listener not isolated | 4 |
| Sample listener not isolated | 4 |
| Device-state listener not isolated | 2 |
| Reconnect during loss not deferred | 2 |
| Disconnect during loss not deferred | 2 |

`npm run verify` exits 0. Jest **153/153**: mobile 23, rep-engine 27, sensor-contracts **99** (was 89), workout-domain
4. Script tests 62/62.

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
