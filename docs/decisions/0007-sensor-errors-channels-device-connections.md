# ADR 0007 — Milestone 2: sensor error states, channels and device connections

- **Date:** 2026-10-23
- **Status:** Proposed.
  - Decision 1 is implemented by RO-012 part 1 (PR #14).
  - Decision 3, and decision 2 as the rep engine uses it, are implemented by part 2.
  - Decision 4's contract and simulated device, and decision 2's channel exposure, are implemented by part 3.
  - Decision 4's app integration is implemented by part 4. The owner's Expo Go check is pending.
  - The owner accepts it by merging; contract changes also need Codex review (`docs/architecture.md` §6).
- **Extends:** [ADR 0002](0002-sensor-contract-and-rep-detector.md) (`SensorSource`) and
  [ADR 0003](0003-full-spec-module-layout.md) ("Module G and multi-channel contracts are added in Milestone 2").
- **Numbering:** ADR 0006 is taken by the rebrandable-naming ADR on open PR #6, so this is 0007.

## Context

Milestone 2 (RO-012) covers several pieces of work:
- sensor connection and error-state handling;
- multi-channel samples;
- a per-channel rep-engine wrapper;
- the device-connection abstraction with a simulated device;
- tests for contracts, channel independence, connection lifecycle and failure handling.

It must not change rep detection or units, and must not claim hardware support (source of truth §2).

On `main` before this ADR, the gaps were:
- **No failure reason.** `SensorStatus` had an `error` value, but no way to say why. No source could fail on purpose,
  so no test covered failure.
- **Sensor failure reported as success.** `WorkoutSessionController` handled a sensor `error` exactly like `stopped`:
  the set ended as `finished` and the reason was lost.
- **Start failure locked the controller.** A rejected `start()` left the session active, so every later start was
  refused.
- **Failed writes left recording running.** A failed write set the status to `error` while recording continued. The
  status then flipped to `finished` when the user stopped.

The RO-011 architecture review (PR #8, open) independently recommended extending the sensor contract suite. Its
recommendations were status-listener unsubscription, idempotent `start()`/`stop()`, error transitions, and
continuous streams.

## Decision 1 — Sensor failure is part of the contract (implemented, RO-012 part 1)

1. **Lifecycle** (documented on `SensorStatus`). The status values are unchanged; there are no new states:
   - `idle → streaming` on `start()`;
   - `streaming → stopped` on `stop()`, or when a finite stream ends;
   - `streaming → error` when the source fails.

   `error` ends the run: the source delivers no further samples, and `stop()` leaves it in `error`. A later
   successful `start()` returns to `streaming` and clears the error.
2. **Reason.** `getLastError(): SensorError | null` returns `{ code, message }`. The codes are:
   - `start_failed`
   - `connection_lost`
   - `stream_timeout`
   - `invalid_data`
   - `unknown`

   The reason is set **before** the `error` status is published, so status listeners can read it. The first failure
   of a run wins. Every other status has a null reason. `message` is diagnostic text, never a measurement.
3. **Start failure.** `start()` rejects with `SensorStartError` (carrying the `SensorError`) when streaming cannot
   begin. The status is then `error`.
4. **Idempotency.** `start()` while streaming and `stop()` when not streaming are no-ops: no state change and no event.
   Each status change is published once.
5. **Shared contract suite.** `describeSensorSourceContract` gains:
   - checks for status-listener unsubscription, double `start()` (no duplicate stream) and no-op `stop()`;
   - `finite: false` for continuous live sources;
   - a configurable `minSampleRateHz`;
   - opt-in failure tests, which run when a harness provides a source that fails mid-stream or at start.

   Future USB-serial and BLE adapters must pass it, including the failure tests.
6. **Simulation.** `SimulatedSensorSource` takes an optional, deterministic `fault`: fail after N delivered samples,
   or at `start()` when N = 0. Fault messages say "Simulated fault", so synthetic failures are never mistaken for
   hardware behaviour. With no fault, the stream is unchanged; a test asserts it equals `generateTrace`.
7. **Sessions.** Every way a recording ends goes through one finalisation step:
   - it releases the sensor;
   - it flushes buffered samples;
   - it marks the session ended.

   How the recording ended decides the outcome:
   - **Stop, or a finite stream ending:** `finished`.
   - **Sensor failure:** `error`. The snapshot carries `sensorError` and a plain message saying how many samples were
     saved.
   - **Start failure:** `error`. The controller is released, so a new set can start.
   - **Failed write:** `error`. The recording is stopped, because unsaved samples cannot be trusted.

   A write failure's message takes precedence over the sensor's reason, because it means data may be missing.

   Two further rules came from Codex's first review of PR #14:
   - **Locking.** The controller stays locked until finalisation has finished: no new start and no reset. Each
     session's outcome is decided from that session's own record, never from the shared snapshot. It is published only
     while that session still owns the snapshot.
   - **`stop()` winning against a pending `start()`.** If `start()` later rejects, the failure becomes that session's
     outcome. If `start()` later succeeds, the sensor is stopped again.
   **No schema change:** the session row does not record why it ended. An end-reason column belongs with the
   Milestone 3 persistence work (RO-013).

## Decision 2 — Channels (implemented across RO-012 parts 2–3)

`docs/hardware-protocol.md` §4 leaves open question 3: `source_id` per sensor, or a channel index?

- **Identity.** One channel = one physical IMU, identified by the existing `source_id` field, which is already "stable
  per physical sensor" and stored on every raw-sample row. There is **no new sample field and no schema change** for
  raw samples.
- **One source per channel.** A device with several IMUs exposes **one `SensorSource` per channel** (Decision 4).
  This refines the earlier plan of letting one source carry several channels. Each source stays single-channel, so:
  - the existing guarantee (`timestamp_ms` non-decreasing per source) is unchanged, and `SensorSource` needs no
    change;
  - there is no ordering across channels, since different IMUs have independent clocks;
  - a consumer that combines channels routes samples by `source_id`, as the part 2 wrapper does.
- **Channel independence.** A gap, failure or noise on one channel must not affect another channel's samples or
  reps. Tests assert this.

## Decision 3 — Per-channel rep-engine wrapper (implemented, RO-012 part 2)

- **One detector per channel.** `MultiChannelRepDetector` (`@repone/rep-engine`) routes each sample by `source_id`
  to that channel's own detector (by default `RotationalRepDetector`).
  - Each detector is created up front from that channel's own calibration, so a bad calibration fails fast.
  - All channels must share one algorithm version.
  - Samples from channels without a calibration are ignored and counted (`ignoredSampleCounts()`).
  - `resetChannel()` resets one channel only.
- **Output.** It implements `MotionDetector<ChannelRepEvent>`, returning channel-tagged results
  (`{ source_id, event }`). `RepEvent` itself is unchanged; its `calibration_id` already differs per channel.
- **Algorithm unchanged.** The algorithm, thresholds, units and `algorithm_version` stay the same. Tests assert that:
  - one channel through the wrapper gives exactly the bare detector's events;
  - with two interleaved channels on different axes and clocks, each channel gives exactly what it gives alone, even
    when the other has a gap, stops early, is very noisy or is reset mid-rep;
  - a single bare detector fed both channels does **not** (which is why the wrapper exists).
- **Persistence deferred.** Storing the channel on `rep_events` is a schema change, left to Milestone 3. Until then
  the app records one channel per session.

## Decision 4 — Device connection and simulated device (implemented: contract in RO-012 part 3, app in part 4)

- **Contract** (`src/device.ts`): `DeviceConnection` covers the following.
  - **Identity.** `deviceId` is a stable identifier, never a display or product name. `transport` is `simulated`,
    `usb_serial` or `ble`.
  - **State.** `ConnectionState` runs `disconnected → connecting → connected → disconnecting`, plus `failed`.
  - **Reason.** `getLastError()` returns a `ConnectionError` with code `unavailable`, `timeout`, `connection_lost` or
    `unknown`. The reason is set before `failed` is published.
  - **`connect()`.** It is idempotent: while connecting it returns the pending attempt. On failure it rejects with
    `DeviceConnectError` and the state becomes `failed`; `connect()` is also how a `failed` device recovers.
  - **`disconnect()`.** It waits for a pending connect, stops every channel, and is a no-op when not connected.
  - **Channels.** `getChannels()` returns one `DeviceChannel { source_id, source }` per IMU, but only while connected.
    A channel's source rejects `start()` with `start_failed` while the device is disconnected. A lost link fails every
    *streaming* channel with `connection_lost` before the device publishes `failed`.

  The shared suite `describeDeviceConnectionContract` tests all of this. It covers instant and delayed connects,
  idempotency, disconnect while streaming, disconnect during a pending connect, listener unsubscription, connection
  loss and recovery, and refused connects. A device's channels must also pass `describeSensorSourceContract`.
- **Simulated device** (`SimulatedDevice`, Module B). It has synthetic channels with an optional per-channel fault,
  an optional connect delay, refused connects (always, or for the first N attempts), and
  `simulateConnectionLoss()`. A fault on one channel leaves the other channel and the connection untouched (tested). A
  two-IMU device streaming into the part 2 wrapper gives each channel exactly its own detection (tested).
- **No real transports.** No native BLE or serial dependency is added in Milestone 2. Real transports come later, as
  `apps/mobile/src/infrastructure/<transport>/` adapters that pass both suites.
- **App integration** (part 4):
  - **Composition root.** `AppContainer.device` is a single-IMU `SimulatedDevice` (`simulated-device-01`, channel
    `simulated-imu-01`). `getSessionSensor()` connects it if needed and returns its channel's source, so starting a set
    connects automatically: the flow keeps one tap.
  - **`features/device-connection`.** A store and hook mirror the device's state and reason. `DeviceConnectionPanel`
    on the home screen shows the transport, the state and any failure reason, with Connect / Disconnect / Reconnect.
    It is locked while a set records or saves.
  - **Losing the connection mid-set** ends the set in `error` with the samples saved so far (Decision 1). The panel
    shows `failed` with the reason, and the next set reconnects.
  - **Not included: a "simulate connection loss" control in the app.** It awaits the owner's decision, so on the
    phone the failure path is covered by tests only.
  - The owner checks the rest in Expo Go.
- **Discovery and pairing UI** are out of scope until a real transport exists.

## Out of scope for Milestone 2

- **Real transports:** USB-serial and BLE adapters, and native dependencies.
- **H0 wire format:** sample rate and packet schema (source of truth §12 open decision 2; RO-016).
- **Milestone 3 work:** database schema changes (end reason, rep-event channel).
- **Detector changes:** algorithm or threshold changes.
- **RO-023:** the warning-badge fix stays a separate P3 task.

## Naming

New identifiers are brand-free, following the rebrandable-naming rule proposed in ADR 0006 (PR #6):
- type names: `SensorError`, `DeviceConnection`, `SimulatedDevice`;
- error codes;
- fault messages.

Device discovery, when it exists, will match neutral service identifiers, never a product-name string.

## Consequences

- **Every `SensorSource` must implement `getLastError()`.** All in-repo sources extend `BaseSensorSource`, which
  provides it. No external implementations exist.
- **Failures are visible.** The UI already shows `error` status and the snapshot's message, so a sensor failure
  mid-set is now visible instead of looking like a saved set. No UI code changed.
- **Test coverage.** The sensor contract suite now runs failure tests for the simulated source. The replay source
  runs the lifecycle tests only, since it has no failure mode.
- **Not yet decided:** how an adapter reports a single malformed packet as opposed to a broken stream. The proposed
  default is to skip it and flag the next sample `sample_gap`, failing with `invalid_data` only on persistent garbage.
  The first real adapter decides, against the H0 evidence.
