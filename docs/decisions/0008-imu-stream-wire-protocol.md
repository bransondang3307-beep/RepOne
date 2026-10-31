# ADR 0008 — IMU stream wire protocol v1 (real sensor → firmware → BLE or USB → app)

- **Date:** 2026-10-31
- **Status:** **Proposed.** Not accepted; nothing is physically verified. The owner accepts it explicitly; merging
  the PR does not accept it.
- **Task:** RO-029 (owner-directed, 2026-10-31): prepare the software path from a real motion sensor to the iPhone
  over BLE.
- **Specification:** [`docs/protocols/imu-stream-v1.md`](../protocols/imu-stream-v1.md).
- **Builds on:**
  - [ADR 0002](0002-sensor-contract-and-rep-detector.md) and [ADR 0003](0003-full-spec-module-layout.md) §5: the raw IMU
    contract;
  - [ADR 0006](0006-rebrandable-product-identity.md): brand-neutral identifiers;
  - [ADR 0007](0007-sensor-errors-channels-device-connections.md) (Accepted): error codes, `source_id` per IMU,
    `DeviceConnection`.

## Context

- **What exists today.** The app can record only from simulated or replayed sources. `docs/hardware-protocol.md` had:
  - a *draft* H0 USB format: an ASCII CSV of raw counts, under a `# repone h0 v1` header;
  - no BLE format at all ("H1 — not defined").
- **What the owner wants.** A testable path: MPU-6050 → firmware → versioned BLE packets → iPhone adapter → the
  existing `DeviceConnection` pipeline, with simulation kept.
- **Hardware facts.** The owner's Uno R3 has no Bluetooth. The wireless board is not chosen, and the GY-521 /
  MPU-6050 is not physically verified.
- **Prior research.** RO-016 (Gemini; H0 serial schema and sample rate) has produced no research yet, so there are no
  established decisions to reuse. This ADR overlaps RO-016's scope, which should be re-scoped (below).

## Decisions (proposed)

1. **One packet format for both transports.** Binary packets, carried either as BLE notifications or as hex-encoded
   `S`/`I` lines over USB. One codec (`@repone/sensor-protocol`) and one firmware encoder serve both. A capture from
   the Uno R3 is therefore real evidence for the BLE path's data handling.
2. **Raw counts on the wire; conversion at the transport boundary.**
   - Packets carry the IMU's int16 register values, plus the full-scale codes they were read with.
   - The app's adapter converts them to `accel_m_s2` / `gyro_rad_s` with the datasheet's nominal sensitivities.
   - No unit, axis remapping, filtering or bias removal happens in firmware.
   - The `RawSensorSample` contract, the detector, its thresholds, calibration and rep classification are unchanged.
3. **Versioned, self-checking packets.**
   - A version byte and a type byte come first.
   - Fixed little-endian layouts, with reserved bits that must be 0.
   - A CRC-16/CCITT-FALSE checksum.
   - Readers reject what they don't understand; they never guess.
   - Sample packets hold 1–31 samples (12 + 16·n bytes ≤ 508). A 20-byte device-info packet carries the serial,
     channel count, ranges, rate, firmware version and status.
4. **Streams, sequence numbers and device time.**
   - Enabling notifications starts a stream: a random stream id, sequence 0, and a `STREAM_START` flag. There is no
     command characteristic.
   - u16 per-sample sequence numbers detect loss (flagged `sample_gap`, never interpolated) and repeats (dropped).
   - The u32 millisecond device clock is unwrapped by the reader.
   - Packets from no current stream are dropped, so data cannot mix across reconnects or sessions.
   - A stream restart mid-run ends the run with `connection_lost`.
5. **Identity.**
   - `deviceId = imu-<serial>`, `source_id = imu-<serial>-ch<n>`, from the board's unique serial in the device-info
     packet. All zeros is rejected.
   - Never the phone's peripheral id, nor any name.
   - Discovery matches the service UUID only. The UUIDs are random and brand-neutral.
6. **Errors.** Device status codes (IMU not found, IMU read failed, MTU too small) map onto ADR 0007's codes, with a
   1 s watchdog for `stream_timeout`. Real data is labelled `sensor` provenance. A failed real connection is reported,
   never silently replaced by simulation.
7. **Defaults.** 50 Hz (the engine's current assumption), ±2 g, ±250 °/s, and batches flushed at 100 ms. The
   bandwidth is about 1.1 kB/s, well within BLE and the Uno's 115200 baud.
8. **Board-independent firmware.**
   - The acquisition and protocol layer is portable C++, with host tests against the same golden packets.
   - The Uno R3 USB bring-up uses it now.
   - The BLE backend waits for the owner's board choice. This ADR states the capabilities that board needs (spec §13).

## Alternatives considered

- **ASCII CSV** (the earlier draft):
  - for: human-readable;
  - against: larger, unvalidated, ambiguous about loss and version, and different from BLE (two parsers).
  - The diagnostic `#` lines keep human readability over USB instead.
- **SI units (float32) on the wire:**
  - against: about twice the bytes, and the conversion would be hidden in firmware.
  - Raw counts plus range codes keep conversion explicit, in one place, and testable.
- **A control characteristic with start/stop commands:**
  - against: unnecessary in version 1, because subscribing and unsubscribing already express it.
  - It can be added in a later version if sample-rate or range changes from the phone are needed.
- **Per-packet base time with deltas:**
  - for: saves 2 bytes per sample;
  - against: more complex, and fragile across loss. Not worth it at 50 Hz.
- **No checksum, relying on BLE's link-layer CRC:**
  - against: the USB path has none.
  - The checksum also catches firmware encoding bugs against the golden fixtures.

## Consequences

- **New package.** `@repone/sensor-protocol` depends only on `@repone/sensor-contracts`. The boundary checker
  enforces that.
- **Hardware protocol document.** `docs/hardware-protocol.md` §2–3 now point to the protocol specification. The draft
  CSV and its product-named header are superseded, which resolves RO-011 finding 5's header note.
- **Follow-up parts:**
  - RO-029 part 2: firmware;
  - part 3: the BLE adapter and app, as a development build. Expo Go cannot load native BLE modules.
- **RO-016** should be re-scoped (owner or ChatGPT): check this proposal against H0 evidence (sample rate, timing
  jitter, I²C read time), rather than design a competing format.

## Open questions for the owner (none blocks the codec)

1. **Rate.** Accept 50 Hz as the default, or choose another? The firmware supports 25–200 Hz.
2. **Board.** Which wireless board? Spec §13 lists the required capabilities. Until it's chosen, the BLE firmware
   backend stays pending.
3. **Accept ADR 0008** as written, or change it, once the codec and firmware PRs have been reviewed?
