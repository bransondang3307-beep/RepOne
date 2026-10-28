# ADR 0002 — Sensor contract, provenance and baseline rep detector

- **Date:** 2026-10-15
- **Status:** Proposed (implemented in Sprint 1; thresholds unvalidated on real hardware)

## Sensor contract

`RawSensorSample` keeps the source-of-truth §7 field names and units **verbatim**
(`timestamp_ms`, `source_id`, `accel_m_s2`, `gyro_rad_s`, `quality_flags`). `timestamp_ms` is
device-relative, not wall-clock; wall-clock fields are explicitly named `*_epoch_ms`.

`SensorSource` (start / stop / subscribe / subscribeStatus, plus `kind` and `provenance`) is the
only hardware boundary. Implemented: `SimulatedSensorSource` (live, seeded synthetic motion) and
`ReplaySensorSource` (immediate or real-time replay). A shared Jest contract suite runs against
every implementation (`describeSensorSourceContract` from `@repone/sensor-contracts/testing`); USB-serial / BLE sources must pass the same suite. Package locations updated by ADR 0003.

## Provenance

Every session stores `provenance ∈ {simulated, replay, sensor}` (DB `CHECK` constraint), the
`source_kind`, `calibration_id` and `algorithm_version`. Synthetic samples carry the
`synthetic` quality flag; calibrations carry `provenance: synthetic | user_reference_rep`. The UI
shows a provenance badge next to every rep count.

## Derived event — additive fields

`RepEvent` matches §7 and adds three fields: `start_timestamp_ms`, `peak_excursion_rad`
(integrated, algorithm-derived — not a direct measurement) and `quality_flags`.
`confidence` is typed as `null` — no confidence is produced until a calibrated model exists.

## Baseline detector: `rotational-rep-fsm-0.1.0`

For rotating mechanisms only (the SoT's recommended first rig). Integrates bias-corrected
gyro about the calibrated axis; states SYNCING → IDLE → MOVING:

- SYNCING: reference position unknown (session start, after a sample gap > 200 ms, or after an
  abandoned rep > 10 s). Waits for 300 ms of stillness (low-pass-filtered |ω| < 0.05 rad/s,
  τ = 50 ms), then zeros the angle.
- IDLE → MOVING at ≥ 20 % of calibrated full ROM; MOVING → rep event when back to ≤ 10 %.
- Classification: peak ≥ 80 % ROM → `full`, else `partial`.
- Re-zeros during stillness while idle (drift control).

These thresholds are **starting hypotheses**, not tuned values.

### Synthetic results (not real-world accuracy)

On the seeded 10-rep labelled set (8 full, 2 partial), sweep of 20 seeds per noise level:

| Gyro noise σ (rad/s) | FP | FN | Misclassified (of 200) |
|---|---|---|---|
| 0.01–0.06 | 0 | 0 | 0 |
| 0.08 | 0 | 8 | 0 |
| 0.12 | 1 | 65 | 0 |

Failure mode at high noise: stillness is rarely detected, so the detector cannot (re)sync.
Also documented by test: large uncorrected gyro bias with no rest between reps drifts and
causes errors. Translation (linear-ROM) machines are **not supported** by this detector.

## Open questions

- Real MPU-6050 noise, vibration and bias on the H0 rig; re-tune thresholds against labelled
  recordings (SoT H0-B/C).
- Sample rate and serial packet schema (SoT §12 decision 2) — the simulator assumes 50 Hz.
