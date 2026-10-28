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
| `source_id` | string | Stable per physical sensor, e.g. `uno-gy521-01`. |
| `accel_m_s2` | `[x, y, z]`, m/s² | Sensor frame. Converted from raw counts **on the phone/adapter**, not assumed by the engine. |
| `gyro_rad_s` | `[x, y, z]`, rad/s | Sensor frame. Bias is removed by calibration, not by the transport. |
| `quality_flags` | string[] | e.g. `synthetic`, `sample_gap`, `saturated` (proposed). |

Engine assumptions today: ~50 Hz (simulator default); gaps > 200 ms abort a rep in progress.
The contract carries **raw IMU**, not position — see ADR 0003.

## 2. H0 — wired USB serial (Uno R3 + GY-521 / MPU-6050) — *proposed*

Hardware facts to verify physically before use (source of truth §4): board, breakout voltage,
I²C address (0x68 typical), wiring 5V→VCC, GND→GND, A4→SDA, A5→SCL.

Proposed line-oriented ASCII stream (easy to log and inspect):

```
# repone h0 v1 accel_range_g=2 gyro_range_dps=250 rate_hz=50
t_ms,ax,ay,az,gx,gy,gz
123456,312,-48,16420,-21,14,3
```

- Header comment line declares format version and full-scale ranges so the adapter can convert.
- Values are signed 16-bit raw counts from the MPU-6050 registers.
- Conversion (MPU-6050 datasheet, **to be confirmed against the actual part/config**):
  accel ±2 g → 16384 LSB/g, × 9.80665 → m/s²; gyro ±250 °/s → 131 LSB/(°/s), × π/180 → rad/s.
- `t_ms` from `millis()`; it wraps after ~49.7 days — adapter must handle wrap.
- Missing lines are detected by timestamp gaps and flagged, not interpolated.

## 3. H1 — BLE — *not defined*

Out of scope for Sprint 1; no native Bluetooth dependencies are installed. A future
`BleSensorSource` (in `apps/mobile/src/infrastructure/bluetooth/`) will implement
`SensorSource` and the device-connection interface planned for Milestone 2. Packet format,
MTU/batching, clock sync and battery reporting will be specified with H1 evidence.

## 4. Open questions

1. Sample rate (50 Hz assumed) and whether firmware or phone timestamps are authoritative.
2. Binary vs ASCII framing for H0; checksum/sequence numbers for loss detection.
3. Multiple sensors/channels: identifier scheme (`source_id` per sensor vs channel index).
