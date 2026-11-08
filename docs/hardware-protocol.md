# Hardware protocol

> **Status: draft, not decided.** No firmware exists and no real sensor has been connected.
> Sample rate and packet schema are source-of-truth §12 **open decision 2**. Everything below
> marked *proposed* needs owner approval (and an ADR) before firmware is written against it.

## 1. What the app requires from any sensor (implemented contract)

Every hardware path must end up as `RawSensorSample` objects delivered through a
`SensorSource` (`@repone/sensor-contracts`) and pass `describeSensorSourceContract`.

| Field | Type / unit | Notes |
|---|---|---|
| `timestamp_ms` | integer, milliseconds | Device-relative, monotonic, non-decreasing. Not wall clock. |
| `source_id` | string | Stable per physical sensor, e.g. `imu-0000a1b2c3d4e5f6-ch0` (format proposed in ADR 0008). **The sensor identity** (owner decision 2026-10-23, ADR 0007 §2): it must be unique per physical IMU, derived from something unique to it (board serial, or device address + channel index), never a product name or a position label alone. A session rejects two channels with the same `source_id` (`combineChannels`). |
| `accel_m_s2` | `[x, y, z]`, m/s² | Sensor frame. Converted from raw counts **on the phone/adapter**, not assumed by the engine. |
| `gyro_rad_s` | `[x, y, z]`, rad/s | Sensor frame. Bias is removed by calibration, not by the transport. |
| `quality_flags` | string[] | e.g. `synthetic`, `sample_gap`, `saturated` (proposed). |

Engine assumptions today: ~50 Hz (simulator default); gaps > 200 ms abort a rep in progress.
The contract carries **raw IMU**, not position — see ADR 0003.

### Failure reporting (implemented contract, ADR 0007 §1)

An adapter reports why it stopped through `getLastError()`, set before its `error` status is published:

| Situation (examples) | `SensorError.code` |
|---|---|
| Port or device cannot be opened; `start()` rejects with `SensorStartError` | `start_failed` |
| Cable unplugged, port closed, link dropped while streaming | `connection_lost` |
| No data for longer than the adapter's watchdog window | `stream_timeout` |
| Data persistently cannot be decoded into valid samples | `invalid_data` |
| Anything else | `unknown` |

`error` ends the run. The app ends the set with the samples received so far saved. How a single malformed line is
handled (skip it and flag the next sample, or fail) is decided with the first real adapter, against H0 evidence.

## 2. H0 — wired USB serial (Uno R3 + GY-521 / MPU-6050) — *proposed*

Hardware facts to verify physically before use (source of truth §4): board, breakout voltage,
I²C address (0x68 typical), wiring.

The H0 stream uses the **IMU stream protocol v1**:
- spec: [`docs/protocols/imu-stream-v1.md`](protocols/imu-stream-v1.md);
- [ADR 0008](decisions/0008-imu-stream-wire-protocol.md), **Proposed**.

The Uno R3 prints the same binary packets a BLE board would notify, as hex lines at 115200 baud:
- `I <hex>`: device info;
- `S <hex>`: samples;
- `# …`: human-readable diagnostics;
- `E <status> …`: errors.

Values are the MPU-6050's raw counts plus their full-scale codes. The app converts them at the transport boundary
(spec §4). Sequence numbers detect loss; the u32 `millis()` clock is unwrapped by the reader.

This replaces the earlier draft CSV stream and its `# repone h0 v1` header. That header was never decided, and it
carried the product name (RO-011 finding 5). The iPhone cannot read the Uno's USB serial, so H0 is a PC-side
bring-up path.

## 3. H1 — BLE — *proposed* (RO-029)

- **GATT.** One service, `19bc0001-bab5-4ddb-8e9c-8595137ac300`, with two characteristics:
  - samples (notify);
  - device info (read, notify).

  Discovery matches the service UUID, never a name.
- **Streams.** Enabling notifications starts a stream. Packets are batched to the negotiated MTU (spec §9).
- **The app adapter** (`apps/mobile/src/infrastructure/bluetooth/`, RO-029 part 3):
  - implements `DeviceConnection` (ADR 0007 §4, `packages/sensor-contracts/src/device.ts`), with one `SensorSource`
    per IMU channel;
  - must pass `describeDeviceConnectionContract`, and each channel `describeSensorSourceContract`.
- **The board.** The wireless board is **not chosen**. Spec §13 lists the capabilities it needs.
- **Connection failures** use `ConnectionError` codes:
  - `unavailable`: not found or refused;
  - `timeout`: connect too slow;
  - `connection_lost`: the link dropped; streaming channels fail with the same code;
  - `unknown`.

## 4. Open questions

1. Sample rate: 50 Hz is proposed (ADR 0008); RO-016 checks it against H0 evidence. Device timestamps are
   authoritative within a stream (proposed).
2. ~~Binary vs ASCII framing for H0; checksum/sequence numbers for loss detection.~~ **Proposed 2026-10-31:** binary
   packets with CRC-16 and u16 sequence numbers, hex-encoded over USB (ADR 0008).
3. ~~Multiple sensors/channels: identifier scheme (`source_id` per sensor vs channel index).~~ **Decided 2026-10-23:**
   `source_id` per physical sensor, with no channel index (ADR 0007 §2).
