# IMU stream protocol, version 1

> **Status: Proposed** ([ADR 0008](../decisions/0008-imu-stream-wire-protocol.md)). Nothing here is physically
> verified: no firmware has run on a real MPU-6050, and no BLE link has carried these packets. Items marked
> **(inherited)** restate decisions already accepted elsewhere. Everything else is a proposal until the owner accepts
> ADR 0008.
>
> Reference implementations:
> - the TypeScript codec, `packages/sensor-protocol` (`@repone/sensor-protocol`);
> - the firmware encoder, `firmware/lib/imu_protocol` (RO-029 part 2).
>
> Both must reproduce the golden packets in `packages/sensor-protocol/fixtures/v1/golden-packets.json`. Those
> packets are **synthetic** test values.

## 1. Scope and the pipeline

```
MPU-6050 registers ──I²C──▶ firmware ──packets──▶ transport ──bytes──▶ app adapter ──RawSensorSample──▶ SensorSource
 (raw int16 counts)          (no units applied)   BLE notify, or          decode, track,       (m/s², rad/s; the
                                                  USB hex lines           convert units         approved contract)
```

- **Units at the boundary.** The wire carries the IMU's raw counts and the full-scale codes they were read with. The
  app's adapter converts to the contract units at the transport boundary. The approved `RawSensorSample` contract,
  the detector, its thresholds, calibration and rep classification are unchanged **(inherited:** ADR 0002, ADR 0003
  §5, ADR 0007**)**.
- **Two transports, one packet format:**
  - **BLE notifications,** for a future wireless board;
  - **USB hex lines,** for the Uno R3 bring-up firmware. The Uno R3 has no Bluetooth.

## 2. Identifiers and versioning

- **Protocol name:** "IMU stream protocol". It is brand-neutral (ADR 0006); no product name appears in packets,
  UUIDs or advertising.
- **Version.** Byte 0 of every packet is the protocol version, **1**.
  - A reader rejects any other version as `unsupported_version` before it reads anything else.
  - A layout change means a new version. Readers never guess.
- **Packet type.** Byte 1 of every packet: `0x01` sample packet, `0x02` device-info packet.
- **GATT identifiers.** Random version-4 UUIDs:

  | Role | UUID | Properties |
  |---|---|---|
  | Service (advertised; the app scans for it) | `19bc0001-bab5-4ddb-8e9c-8595137ac300` | — |
  | Samples | `19bc0002-bab5-4ddb-8e9c-8595137ac300` | notify |
  | Device info | `19bc0003-bab5-4ddb-8e9c-8595137ac300` | read, notify |

- **Advertised name.** Optional, and for people only. The app never matches on it. It must be brand-neutral if
  present, e.g. `IMU a1b2`.

## 3. Sensor identity (inherited policy, proposed encoding)

- **Device serial.** 8 bytes in the device-info packet, shown as 16 lowercase hex digits, most significant byte
  first.
  - It must be unique to the physical board.
  - All zeros is rejected as "unconfigured".
  - A board with a factory-unique ID (e.g. a BLE MAC address or a chip serial) uses it. The Uno R3 has none, so its
    firmware has a configured constant that the owner sets per board.
- **`deviceId`** (`DeviceConnection`) is `imu-<serial>`. **`source_id`** (each channel) is `imu-<serial>-ch<n>`.
- **What it is not.** The phone's peripheral identifier (on iOS, a per-phone UUID) and the advertised name are never
  identities. That follows ADR 0007 §2 **(inherited)**: `source_id` is stable per physical sensor, unique within a
  session, and never a product name or a position label alone.

## 4. Units, axes and frame

| Wire field | Type | Meaning |
|---|---|---|
| `accel x, y, z` | int16 | Raw accelerometer counts, registers `ACCEL_XOUT…ZOUT`, in that order |
| `gyro x, y, z` | int16 | Raw gyroscope counts, registers `GYRO_XOUT…ZOUT`, in that order |
| accel range code (2 bits) | 0–3 | AFS_SEL: ±2, ±4, ±8, ±16 g → 16384, 8192, 4096, 2048 LSB/g |
| gyro range code (2 bits) | 0–3 | FS_SEL: ±250, ±500, ±1000, ±2000 °/s → 131, 65.5, 32.8, 16.4 LSB/(°/s) |

- **Conversion.** Sensitivities are the nominal values from the MPU-6000/6050 register map (RM-MPU-6000A-00, registers
  27–28):
  - `accel_m_s2 = raw / LSB_per_g × 9.80665`;
  - `gyro_rad_s = raw / LSB_per_dps × π / 180`.

  Each sample packet carries the codes it was read with, so a capture decodes on its own. Factory sensitivity
  tolerance (a few percent) is not corrected here.
- **Axes and frame.** x, y and z are the IMU's own right-handed sensor frame, as printed on the chip and breakout.
  Neither firmware nor transport remaps, filters or removes bias. Mounting orientation and bias are calibration's
  job, and that policy is unchanged **(inherited)**.
- **Saturation.** A raw value of −32768 or 32767 may have clipped. The app flags that sample `saturated`.

## 5. Sample packet (type `0x01`)

Little-endian. Size **12 + 16·n** bytes, for **n = 1–31** samples (28–508 bytes; an ATT value holds at most 512).

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | version = 1 |
| 1 | 1 | type = `0x01` |
| 2 | 1 | flags. Bit 0 `STREAM_START`: first packet of a stream. Bit 1 `DEVICE_OVERFLOW`: the device dropped samples before this packet. Bits 2–7 reserved, must be 0 |
| 3 | 1 | config. Bits 0–1 accel range code; bits 2–3 gyro range code; bits 4–7 channel (IMU index 0–15) |
| 4 | 2 | stream id (u16), chosen at random each time the device starts streaming |
| 6 | 2 | sequence number of the first sample (u16, wraps); sample *i* has `first + i` |
| 8 | 1 | sample count *n* (1–31) |
| 9 | 1 | reserved, must be 0 |
| 10 + 16·i | 4 | sample *i*: device time, ms since boot (u32) |
| 14 + 16·i | 12 | sample *i*: accel x, y, z, gyro x, y, z (6 × int16) |
| 10 + 16·n | 2 | CRC-16/CCITT-FALSE (poly `0x1021`, init `0xFFFF`, no reflection, no final XOR) over every preceding byte |

Worked example: golden packet `samples-stream-start-1` (synthetic). It is the first packet of stream `0x1234`, with
one sample at t = 1000 ms: +1 g on z at ±2 g, and +1 / −1 °/s on x / y at ±250 °/s.

```
01 01 01 00 | 34 12 | 00 00 | 01 | 00 | e8 03 00 00 | 00 00 00 00 00 40 | 83 00 7d ff 00 00 | 52 18
ver typ flg cfg  stream   seq0   n   rsv   t=1000       ax=0 ay=0 az=16384  gx=131 gy=-131 gz=0  CRC 0x1852
```

## 6. Device-info packet (type `0x02`)

Little-endian, fixed **20** bytes, so it fits the default 23-byte ATT MTU.

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | version = 1 |
| 1 | 1 | type = `0x02` |
| 2 | 8 | device serial (§3), most significant byte first; never all zeros |
| 10 | 1 | channel count (1–16) |
| 11 | 1 | default ranges. Bits 0–1 accel code; bits 2–3 gyro code; bits 4–7 reserved, must be 0 |
| 12 | 2 | nominal sample rate, Hz (u16, ≥ 1) |
| 14 | 1 | firmware version, major |
| 15 | 1 | firmware version, minor |
| 16 | 1 | status (§10) |
| 17 | 1 | reserved, must be 0 |
| 18 | 2 | CRC-16/CCITT-FALSE over bytes 0–17 |

## 7. Validation (the reader's order)

1. **Version.** Fewer than 2 bytes → `truncated`. Version ≠ 1 → `unsupported_version`.
2. **Type.** Anything else → `unknown_packet_type`.
3. **Length.**
   - A sample count outside 1–31 → `bad_sample_count`.
   - Fewer bytes than the header and count require → `truncated`; more → `length_mismatch`.
   - Device info that isn't exactly 20 bytes → `truncated` or `length_mismatch`.
4. **Checksum.** A mismatch → `bad_checksum`.
5. **Fields.**
   - Reserved bits or bytes set → `reserved_bits_set`.
   - A zero serial, zero or more than 16 channels, or a 0 Hz rate → `invalid_field`.

A rejected packet is dropped and counted. **What the adapter does about persistent bad data is decided in RO-029
part 3**: the proposal is to fail the run with `invalid_data` after repeated rejects. ADR 0007 left that open until
the first real adapter.

## 8. Streams, sequence numbers and time

- **Starting.**
  - Over BLE, a stream starts when the app enables notifications on the samples characteristic. Over USB it starts
    at boot.
  - The device picks a fresh random stream id, restarts the sequence at 0, sets `STREAM_START` on the first packet,
    and discards anything buffered from before.
- **Stopping.** Disabling notifications, or disconnecting, stops the stream. There is no start/stop command
  characteristic in version 1, because subscription already says it.
- **Loss detection.** The reader expects `first_sequence` = the previous packet's `first + n`, modulo 65536.
  - A forward jump of *d* (1 ≤ *d* < 32768) means *d* samples were lost. The next delivered sample is flagged
    `sample_gap`.
  - A backward jump (≥ 32768 modulo 65536) is a repeated or out-of-order packet, and is dropped.
  - `DEVICE_OVERFLOW` also flags the next sample `sample_gap`; the device knows samples were dropped but not how many.
  - Samples are never interpolated.
- **Device time.** u32 milliseconds since boot (`millis()`). It wraps after 2³² ms, about 49.7 days.
  - The reader unwraps it: a backward step larger than 2³¹ counts as one wrap, so `timestamp_ms` keeps increasing.
  - A smaller backward step is a clock error. That sample is dropped and the next one flagged `sample_gap`.
  - `timestamp_ms` is the unwrapped device time: device-relative, never wall clock **(inherited contract)**.
- **Resets.**
  - A packet with `STREAM_START` and a new stream id while a stream is running means the device restarted
    streaming, e.g. it rebooted. The reader reports it.
  - **Proposed:** the adapter ends the current run with `connection_lost` ("the device restarted its stream"), because
    device time and sequence numbers restart and the set cannot continue seamlessly.
- **Stale data.** Packets that arrive before any `STREAM_START`, or that carry another stream id, are dropped. A
  reconnect clears every stream, so nothing from before a disconnect can mix into a new run or a new session.

## 9. MTU, batching, sample rate and bandwidth

- **Notification size.** A notification carries at most ATT_MTU − 3 bytes, so *n* = min(31, ⌊(MTU − 15) / 16⌋).

  | ATT MTU | Samples per notification |
  |---|---|
  | 23 (BLE default) | 0: cannot stream |
  | 31 | 1 (the minimum) |
  | 185 (typical iPhone) | 10 |
  | 247 | 14 |
  | ≥ 511 | 31 |

  iOS negotiates the MTU itself; apps cannot request it. 185 is the commonly observed iPhone value, but **must be
  measured on the real board**. If the MTU can't carry one sample, the device reports status `MTU_TOO_SMALL` and does
  not stream.
- **Batching.** The device sends when *n* samples are buffered **or 100 ms after the oldest buffered sample**,
  whichever is first, so latency stays well under the detector's 200 ms gap threshold.
- **Proposed default rate: 50 Hz** (the rate the engine assumes today), with ranges ±2 g and ±250 °/s. The firmware
  allows 25–200 Hz. The exact H0 rate is RO-016's question; this proposal does not settle it.
- **Bandwidth at 50 Hz with 100 ms batches** (5 samples, 92-byte packets, 10 per second):
  - about 920 B/s of packets;
  - about 1.1 kB/s with ATT/L2CAP/link-layer overhead (≈ 17 B per packet).

  A BLE 1M-PHY link at iOS connection intervals (15–30 ms) carries tens of kB/s, a margin of more than 10×. At 200 Hz
  it is about 3.4 kB/s, still within the margin.
- **USB (Uno R3) at 115200 baud** (11.5 kB/s): one sample per `S` line is 59 characters, so 50 Hz uses ≈ 3 kB/s
  (26%).

## 10. Status and errors

| Status | Meaning | Over BLE | Over USB | App mapping (proposed; ADR 0007 codes) |
|---|---|---|---|---|
| 0 | OK | device info | `I` line | — |
| 1 | `IMU_NOT_FOUND`: no I²C acknowledge, or an unexpected `WHO_AM_I` at start-up | device info, read and notified | `E 1 …` and `I` line | `start()` rejects with `start_failed` |
| 2 | `IMU_READ_FAILED`: an I²C read failed while streaming | notified; streaming stops | `E 2 …` | the run ends with `unknown` and the device's message |
| 3 | `MTU_TOO_SMALL` | notified; no streaming | — | `start_failed` |
| other | reserved | — | — | treated as an error (`unknown`) |

**Watchdog (proposed):** no valid sample for 1000 ms while streaming → `stream_timeout`. A link drop →
`connection_lost` **(inherited:** the `DeviceConnection` contract fails every streaming channel first**)**.

## 11. Reconnection

The adapter never reconnects in the background and never falls back to simulation.
- After a disconnect, the device shows **Connection failed**, and the user taps Reconnect, as with the simulated
  device today.
- The next set starts a fresh stream (§8).
- If a real connection fails, the app reports that failure. Simulation is a separate, explicit choice in the UI.

## 12. USB diagnostic representation (Uno R3 bring-up)

The Uno R3 firmware prints lines at **115200 baud**, 8N1:

| Line | Meaning |
|---|---|
| `I <hex>` | a device-info packet, at boot and whenever the status changes |
| `S <hex>` | a sample packet: the same bytes a BLE board would notify, hex-encoded |
| `# <text>` | a human-readable diagnostic, e.g. a once-a-second readout in m/s² and °/s. **Never data** |
| `E <status> <text>` | a device error, with the status codes above |

`parseSerialLine()` in `@repone/sensor-protocol` reads these. It replaces the draft CSV stream and its
`# repone h0 v1` header in `docs/hardware-protocol.md` §2. That header carried the product name (RO-011 finding 5).

## 13. Wireless board: required capabilities (not selected, not owned)

Any board that implements the BLE side must have:
- **Bluetooth:** a BLE 4.2+ peripheral (GATT server) with notifications, and ATT MTU ≥ 31 (ideally ≥ 185, with LE
  Data Length Extension).
- **IMU:** an I²C controller at 100–400 kHz, with logic levels compatible with the chosen IMU breakout. Verify against
  the actual breakout; there is no assumption here.
- **Identity:** a readable factory-unique ID for the device serial, or a documented per-board constant.
- **Memory:** about 1 KB of RAM for a sample buffer (50 Hz × 16 B, 1 s headroom).
- **Toolchain:** a maintained BLE stack and toolchain (for example, an Arduino core with NimBLE, or a Zephyr-based
  SDK) that can compile `firmware/lib/imu_protocol` (portable C++).
- **USB:** for flashing and serial logs.

Families that meet this include ESP32-S3 / ESP32-C3 and nRF52840 development boards. **No board is chosen.** The BLE
firmware backend stays pending until the owner chooses one.
