# ADR 0009 — Pause-aware rep-cycle semantics for the rotational detector

- **Date:** 2026-11-04
- **Status:** **Proposed.** Implemented on `claude/RO-032-pause-aware-rep-detection` as `rotational-rep-fsm-0.2.0`.
  It needs owner acceptance before it counts as the accepted design (§8).
- **Task:** RO-032 (owner-assigned, 2026-11-04)
- **Revises:** the detector section of [ADR 0002](0002-sensor-contract-and-rep-detector.md) (`rotational-rep-fsm-0.1.0`).
  Sensor units, `RawSensorSample`, `RepEvent`, `RepCalibration` and `MotionDetector` are **unchanged**.
- **Evidence:** synthetic only. No real sensor has been connected (source of truth §2). Every number below comes from
  scripted, seeded traces and says nothing about accuracy on hardware.

## 1. Context

### 1.1 Owner requirement (2026-11-04)

> "If I move upward, stop halfway, and then keep moving upward, that must not count as another rep. The original
> upward movement has not finished."

A pause must keep the cycle in progress open, and resuming in the same direction continues that cycle. A timeout must
never turn an incomplete movement into a full rep. Exercise direction ("up") must not be hard-wired to a sensor axis.

### 1.2 What 0.1.0 actually does (audit of `main` @ `b414307`)

- **Measures:** the bias-corrected gyro rate about the calibrated axis, integrated with the trapezoidal rule into an
  angle. Excursion is `|angle|`, so direction and mount sign do not matter. The accelerometer is never read.
- **Stillness:** a first-order low-pass of the signed rate (τ = 50 ms) stays below 0.05 rad/s for 300 ms.
- **States:** `SYNCING` → `IDLE` at first stillness, zeroing the angle there. `IDLE` → `MOVING` at ≥ 20 % of ROM.
  `MOVING` → event and back to `IDLE` at ≤ 10 % of ROM. The event is `full` if the peak was ≥ 80 % of ROM, else
  `partial`. `IDLE` re-zeros the angle whenever it is still (drift control).
- **Pauses and reversals:** position-based, so a pause or a midway reversal that does not re-enter the 10 % band
  leaves the cycle open. **The owner's case already passed on 0.1.0** (reproduced, §1.3).
- **Long cycles:** a cycle older than 10 s was dropped silently. The detector then reset, and it re-zeroed at the
  next stillness wherever the lever happened to be.
- **Gaps:** a gap above 200 ms abandons the cycle silently and resyncs at the next stillness, assuming that is the
  start position.
- **Rotation:** assumed. Translation (weight-stack) machines are not supported.
- **Evidence:** synthetic tests only (10-rep labelled set, noise sweep, gap, bias drift).

### 1.3 Reproduction (frozen copy of 0.1.0 in `packages/rep-engine/test/reference/`)

Scenarios and labels come from `test/scenarios/catalog.ts`, with ROM ≈ 70°, 50 Hz, and gyro noise σ = 0.02 rad/s.

| Scenario (synthetic) | Expected | 0.1.0 result | Defect |
|---|---|---|---|
| Up to 50 %, 1.5 s pause, up to 100 %, return (owner case) | 1 full | 1 full, correct timing | none |
| Several pauses, pause near the top, pause just outside the return band, slow, constant speed, reversals | as labelled | as labelled | none |
| Up to 50 %, **15 s pause**, continue, return; then one more rep | 2 full | **3 partials, 0 full** | The timeout reset and re-zeroed at the paused position. Phantom cycles then ran half a cycle out of phase |
| **20 s hold at the top**, return; then one more rep | 2 full | 1 full, mistimed | Same mechanism |
| 600 ms **disconnect while held at the top**; two more reps | 3 full, timed | 3 counted, but **~1 s early** (each fired at the next top) | Resynced at the top, assuming it was the start |
| Hold with 0.35° / 8 Hz jitter from the start | 1 full | **0 reps** | The rate low-pass never read "still", so it never synced |
| Incomplete cycle when the session ends | 1 full + reported incomplete | 1 full, incomplete cycle invisible | Silent |

## 2. Decision — movement semantics (generic cycle model)

The detector models a **movement cycle** of a rotating mechanism. Exercise meaning ("up", "press", "curl") stays
outside the detector: it sees only a signed angle from a start position.

1. **Start position.** Where the mechanism is settled when the reference is established: at the session's first
   settled rest, and again at every settled rest inside the start band (drift control). It need not be the bottom of
   the travel, and any axis or mount sign works. **Assumption:** a session begins at the start position.
2. **Cycle start, outward phase.** A cycle begins when |angle| first reaches `startFraction` (20 %) of ROM.
   `start_timestamp_ms` is that crossing, not the first movement.
3. **Return phase.** Any motion back toward start. A reversal is **meaningful** only when it re-enters the return
   band, |angle| ≤ `returnFraction` (10 %). Between the 10 % and 20 % thresholds there is hysteresis.
4. **Completion — the only way a rep is counted.** The cycle completes on re-entering the return band, which emits
   exactly one `RepEvent`. It is `full` if the cycle's peak reached `fullFraction` (80 %), else `partial`. Only `full`
   reps count toward a set (ADR 0003). The event fires when the mechanism *enters* the band, slightly before it is
   fully at rest. On the synthetic set this is 160–240 ms early for 1–2 s returns and ~840 ms early for a 4 s return.
5. **Pause.** Any stretch inside a cycle where the position stays put, with or without jitter. A pause **never** ends
   a cycle, never starts one, and never emits an event. Resuming in the same direction, or in the other direction,
   continues the same cycle; the peak is the maximum over the whole cycle. Zero acceleration is not evidence of a pause,
   and renewed acceleration is not evidence of a new rep. Transitions depend on position only.
6. **Long cycles.** A cycle lasting more than `longCycleMs` (10 s) is **kept open and tracked**. Its eventual
   completion is classified from its real peak and carries the quality flag `long_cycle`. No timeout abandons a cycle,
   and none can promote one: a cycle is `full` only if the mechanism really reached 80 % of ROM and came back. (The
   alternative, abandoning long cycles, is option B1 in §8.)
7. **Cycles that end without a rep.** These are reported through `takeUnfinishedCycles()` / `finish()` as
   `UnfinishedCycle`, and never as a `RepEvent`:
   - `interrupted` / `sample_gap`: the position reference was lost mid-cycle (gap > 200 ms). The real cycle may have
     completed during the gap, but it is not counted.
   - `incomplete` / `session_end`: `finish()` was called while a cycle was open.

   After a gap, a cycle whose beginning was not observed is tracked in a `returning` state. Its return to start
   counts nothing. If the mechanism stays settled away from start for longer than `longCycleMs`, that position becomes
   the new start, flagged `reference_assumed` on the next cycle.
8. **Quality flags** added by the detector, alongside the sample flags it already passes through:
   - `long_cycle` (item 6);
   - `gravity_disagreement` (§3): a mid-cycle gravity reading disagreed with the gyro by more than 20 % of ROM, so it
     was not applied;
   - `reference_assumed`: after a gap, without gravity, the rest position was assumed to be the start.

   Flags are informational. They do not change the count.
9. **Calibration and orientation.** The calibration supplies the axis, gyro bias and full ROM (unchanged
   `RepCalibration`). All thresholds are fractions of that ROM. Excursion is unsigned, so a flipped mount or a
   different axis needs no configuration. The sign of the last cycle's peak (`outwardSign`) is remembered, including
   that of a cycle interrupted by a gap, so that a position re-anchored after a gap lands on the side where cycles
   happen. Gravity is unsigned, so that side is a guess until the next settled rest in `returning`. There, the
   detector keeps whichever side makes the gyro's signed motion since the anchor agree with the gravity distance now.
   That corrects a wrong guess, for example a gap before any cycle on a mirrored mount (Codex P1, PR #31).
   The side changes only when gravity rules the current one out; while both fit (no motion since the anchor), noise
   cannot flip it. Until the side is trusted (from an observed cycle or confirmed by gravity), the integrated angle
   alone may not end the return, because with a guessed side it can cross zero while the lever is moving further out.
   The return then ends only at a settled rest that gravity places inside the start band (Codex P1, PR #31 round 2).
   **Cost:** a rep started right after such a gap, before any settled rest, can be lost. This is conservative: it may
   miss a rep, but it never adds one.

## 3. Gravity as an absolute angle at rest

A resting accelerometer measures only gravity. For a lever rotating about a fixed sensor axis, the gravity vector
projected onto the plane perpendicular to that axis turns by exactly the lever angle. So at rest the unsigned angle
between the start-position gravity vector and the current one is a **drift-free absolute excursion**. It is unsigned,
so it does not depend on the sensor's axis handedness.

- It is used only when **settled** (§4), and only if at least `minGravityPlaneFraction` (50 %) of 9.80665 m/s² lies
  in the rotation plane. With a vertical rotation axis gravity does not change, so the detector falls back to the
  gyro alone. Tests cover this case (z axis).
- **Mid-cycle pause:** the gravity angle replaces the integrated angle if the two agree within 20 % of ROM. If not,
  the gyro angle is kept and the cycle is flagged `gravity_disagreement`; a knock or a slipping mount is the likely
  cause.
- **After a gap:** at the first settled rest the gravity angle re-anchors the position.
  - Near start → `idle`.
  - Otherwise → `returning` (§2.7), instead of assuming the rest position is the start.
- **Why it matters:** the uncalibrated residual of the MPU-6050 zero-rate output drifts with temperature. The spec
  gives ±20 °/s over −40…85 °C; spread linearly, that bounds the drift at about 0.16 °/s per °C, a derived estimate.
  A residual of 0.02 rad/s integrates to ~25 % of a 70° ROM over a 15 s pause. A synthetic test shows the cycle breaks
  without gravity and is preserved with it.
- **Not used for counting:** the accelerometer never starts, ends or classifies a cycle. Acceleration bursts without
  rotation produce nothing (tested).

## 4. Stillness ("settled") criterion

**Settled** means the integrated angle stayed within `restBandFraction` (2 %) of ROM for the last `restWindowMs`
(300 ms), with the window fully covered by samples. This replaces the low-passed rate threshold, and its
two parameters replace three.

- It is a **position** criterion. Constant-speed motion (zero angular acceleration) is never settled.
- Zero-mean jitter smaller than the band is settled, which fixes the "never syncs while holding" defect. The synthetic
  tremor model is 0.5 % of ROM at 8 Hz, an assumption rather than a measurement.
- Zeroing and gravity corrections apply to the window **mean**, so the reference does not creep with the first 2 % of
  a movement.
- It equates to a speed limit of 2 % ROM / 300 ms ≈ 4.7 °/s for a 70° ROM. Slower motion counts as settled, as motion
  below 0.05 rad/s did in 0.1.0.

**Synthetic noise sweep** (10-rep labelled set, 20 seeds, 200 reps per row):

| Gyro σ (rad/s) | 0.1.0 FP / FN | 0.2.0 FP / FN / misclassified |
|---|---|---|
| 0.02–0.06 | 0 / 0 | 0 / 0 / 0 |
| 0.08 | 0 / 8 | 0 / 0 / 0 |
| 0.12 | 1 / 65 | 0 / 0 / 0 |
| 0.2 | 0 / 200 | 0 / 0 / 0 |
| 0.3 | 0 / 200 | 1 / 3 / 1 |
| 0.5 | 0 / 200 | 18 / 56 / 11 |

For scale, the MPU-6050 spec gives 0.05 °/s-rms total gyro noise at 100 Hz bandwidth (≈ 0.001 rad/s). Real machines
add vibration that is not yet measured.

## 5. Sensor limitations (what the detector does and does not claim)

- **Acceleration, velocity, position.** The detector integrates angular *velocity* once into angular *position*. It
  never integrates acceleration, and never treats an acceleration burst as a rep.
- **Gravity and orientation.** Gravity is used only at rest, as an absolute angle. During motion the accelerometer
  also carries tangential and centripetal terms, so it is ignored.
- **Drift.** A single integration of a residual rate bias grows linearly in time; a double integration of an
  accelerometer bias grows quadratically (Woodman 2007). Re-zeroing at start and gravity at pauses bound the first. The
  second is why translation is not supported.
- **Translational (weight-stack) machines are not supported and not attempted.** Naive double integration of
  acceleration is not a reliable displacement, and this ADR does not pretend one threshold works for every machine.
  The candidate approach is option D in §8: a separate detector using zero-velocity-bounded integration between
  detected stance periods, as in foot-mounted inertial navigation (Foxlin 2005; Skog et al. 2010). It needs its own
  task, its own ADR and real data first.
- **Touch-and-go reps.** If the lever turns around above the return band (> 10 %) without re-entering it, two reps
  merge into one cycle. This is the hysteresis trade-off that protects pauses near start; option C in §8.
- **A sample gap loses that cycle.** Tests cover it: it is reported `interrupted`, never counted. Without gravity
  (vertical axis), later reps can be shifted by half a cycle; they are flagged `reference_assumed`.
- **Session start must be at the start position.** No reference exists before the first settled rest.

## 6. Thresholds (all unvalidated hypotheses)

| Parameter | 0.1.0 | 0.2.0 | Role |
|---|---|---|---|
| `startFraction` | 0.2 | 0.2 | Cycle starts; gravity agreement limit |
| `returnFraction` | 0.1 | 0.1 | Cycle completes |
| `fullFraction` | 0.8 | 0.8 | Full vs partial |
| `restOmegaRadS`, `restSmoothingMs` | 0.05 rad/s, 50 ms | *removed* | Replaced by the band |
| `restBandFraction` | — | 0.02 | Settled band |
| `restWindowMs` | 300 | 300 | Settled window |
| `maxSampleGapMs` | 200 | 200 | Reference loss |
| `maxRepDurationMs` → `longCycleMs` | 10 000 (abandon) | 10 000 (flag only) | Long-cycle flag; park-and-accept after a gap |
| `minGravityPlaneFraction` | — | 0.5 | Gravity observability |

## 7. Consequences

- `algorithm_version` becomes `rotational-rep-fsm-0.2.0`, so stored sessions remain traceable to the version that
  produced them.
- The config keys `restOmegaRadS`, `restSmoothingMs` and `maxRepDurationMs` are removed or renamed. Only `rep-engine`
  uses them (checked on `main` and all open branches).
- New public API in `@repone/rep-engine`, none of it in shared contracts:
  - `RotationalRepDetector.takeUnfinishedCycles()` and `finish()`;
  - `UnfinishedCycle` and `DETECTOR_QUALITY_FLAGS`;
  - the offline trial-evaluation API and `npm run evaluate:trials` (format in
    [the capture protocol](../experiments/rep-detection-capture-protocol.md)).
- `evaluateReps` returns its matched pairs as an additive field.
- **Integration requirement for the app (not done here, owner of `apps/mobile` decides):**
  - `WorkoutSessionController` should call `finish()` when a set ends;
  - it should drain `takeUnfinishedCycles()` and log or persist the outcomes;
  - showing `long_cycle` and `reference_assumed` is a UI decision;
  - a raw-sample export to `rep-trial-v1` is needed for real-data validation.

  Until then the app behaves as before: it simply never sees unfinished cycles. `MultiChannelRepDetector` is
  unchanged and still wraps the per-channel detector.

## 8. Decisions requested from the owner

- **A. Accept the cycle semantics in §2**, including that a pause never ends a cycle and completion fires on
  re-entering the return band.
- **B. Long-cycle policy.**
  - **B0 (implemented):** keep the cycle open, classify from the real peak, flag `long_cycle`.
  - **B1:** abandon after `longCycleMs`. Report the cycle as `abandoned`, count nothing, and require a return to start
    before the next cycle.

  B1 never counts a minute-long hold as a rep. It also discards legitimate slow or lockout-hold reps.
- **C. Touch-and-go.** Keep the 10 % return band (implemented), or count a reversal near start (for example below
  20 %) as a boundary. The second option risks splitting a cycle that pauses near start.
- **D. Translation.** Approve a separate research task (proposed in the RO-032 handoff; no ID taken), only after H0 recordings
  exist.
- **E. Gravity reference.** Accept accelerometer use at rest (§3), or keep 0.2.0 gyro-only via
  `minGravityPlaneFraction > 1`.

## 9. Sources

- InvenSense, *MPU-6000 and MPU-6050 Product Specification*, PS-MPU-6000A-00, rev. 3.2 (2011), §6.1–6.2:
  - gyro initial zero-rate tolerance ±20 °/s, and ±20 °/s over −40…85 °C;
  - rate noise 0.005 °/s/√Hz, total 0.05 °/s-rms at 100 Hz;
  - gyro scale-factor tolerance ±3 %, cross-axis ±2 %;
  - accelerometer noise 400 µg/√Hz.
- O. J. Woodman, *An introduction to inertial navigation*, University of Cambridge Computer Laboratory,
  UCAM-CL-TR-696, 2007 (error growth of single and double integration).
- E. Foxlin, "Pedestrian tracking with shoe-mounted inertial sensors", *IEEE Computer Graphics and Applications*
  25(6), 2005 (zero-velocity updates).
- I. Skog, P. Händel, J.-O. Nilsson, J. Rantakokko, "Zero-velocity detection — an algorithm evaluation", *IEEE Trans.
  Biomedical Engineering* 57(11):2657–2666, 2010, doi:10.1109/TBME.2010.2060723. Gyro-based stance detection
  outperformed accelerometer-based detection there.
