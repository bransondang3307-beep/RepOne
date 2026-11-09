# Hardware-dependent acceptance tests (future)

> **Status: none of these has been run.** The owner is away from the Arduino and MPU-6050 (2026-11-06). Everything
> verified so far is software-only, on simulated or synthetic data and fake transports. Each test below is an
> explicit future acceptance test. Until it passes, nothing claims real Bluetooth connectivity, real IMU readings or
> real rep-counting accuracy (source of truth §2).

**How to use this list:**
- Run the tests in order: each stage needs the one before it.
- Record each result as a dated comment on the linked PR, or in a handoff, with the evidence named in the test.
- A result is **pass**, **fail** (with what was seen) or **blocked** (with why).

**Safety (source of truth §3.1, §4):**
- Bench tests use a controlled, unloaded rig only.
- Never mount an experimental device on active gym equipment.
- Confirm the breakout's supply voltage before powering it, and disconnect USB while wiring.

## Stage H0 — wired bench prototype (Uno R3 + GY-521)

| ID | Test | Pass criteria | Evidence | Task / PR |
|---|---|---|---|---|
| HW-01 | Parts and wiring: identify the board, the GY-521 and its supply voltage; wire 5V/GND/A4/A5 | Parts match the source of truth §4; nothing gets hot | Photo of the wiring (no gym content) | RO-018 |
| HW-02 | I²C scan | MPU-6050 found at 0x68 (or 0x69) | Serial monitor log | RO-018 |
| HW-03 | Flash `firmware/uno-usb` and stream | 50 Hz `S` lines; the device-info `I` line shows a non-zero serial and status OK; no `E` lines at rest | Log of 60 s | RO-029 part 2 ([PR #27](https://github.com/bransondang3307-beep/RepOne/pull/27)) |
| HW-04 | Units and axes: decode a capture with `@repone/sensor-protocol` | At rest \|accel\| ≈ 9.8 m/s² (±5 %); gyro ≈ 0 rad/s (bias < 0.1 rad/s). Rotating by hand about each axis gives the right signed gyro axis, and the accel axes are consistent with it | Decoded capture + notes | RO-029 / RO-016 |
| HW-05 | Gaps and timing: 10 min continuous capture | Timestamp gaps reported, not interpolated; sample rate within ±2 % of 50 Hz | Gap and rate summary | RO-029 |

## Stage H0-B/C — rep detection on the bench

The capture and labelling protocol is `docs/experiments/rep-detection-capture-protocol.md`, on
[PR #31](https://github.com/bransondang3307-beep/RepOne/pull/31). These tests need an export of the recordings to
`rep-trial-v1` (see Integration below).

| ID | Test | Pass criteria | Evidence | Task / PR |
|---|---|---|---|---|
| HW-10 | Calibration: rest 3 s, then one full reference rep → `calibrateFromReferenceRep` | The axis is the hinge axis; the ROM matches the marked travel within ±5° | Calibration JSON | RO-032 |
| HW-11 | Owner requirement, on evaluation trials of `midway-pause` and `multi-pause` | 0 extra full reps; 0 events during pauses; all reps detected | `npm run evaluate:trials -- <dir> --split evaluation` report | RO-032 (ADR 0009 A) |
| HW-12 | Holds with jitter (`hold-jitter`) | 0 false counts during holds | Same report | RO-032 |
| HW-13 | Full-rep precision and recall, on evaluation trials of every scenario | Report the numbers. Precision and recall ≥ 95 % are aspirational targets, not pass gates | Report, by scenario | RO-032 |
| HW-14 | Partial vs full (`partial`) | Report the full/partial confusion | Report | RO-032 |
| HW-15 | Long pause and gravity reference (`long-pause`, horizontal hinge) | Each long cycle counts once, flagged `long_cycle` | Report + flags | RO-032 (ADR 0009 B, E) |
| HW-16 | Touch-and-go (`continuous-fast`) | Measure the merged-rep rate. This input decides ADR 0009 C | Report | RO-032 (ADR 0009 C) |

## Stage H1 — BLE

The detailed steps are RO-029's acceptance plan, stages B and C (`docs/handoffs/2026-10-31-claude-RO-029-completion.md`
§3, on [PR #28](https://github.com/bransondang3307-beep/RepOne/pull/28)).

| ID | Test | Pass criteria | Task / PR |
|---|---|---|---|
| HW-20 | Development build, no sensor (RO-029 stage B) | Every B step passes; nothing is added to History without a sensor | RO-029 part 3 |
| HW-21 | Discovery and first notification (C1–C2) | The sensor is listed and connects; about 50 samples/s; the badge says **Live sensor** | RO-029 part 3; needs a BLE board |
| HW-22 | Link loss and reconnect (C3+) | Error with its reason; the samples before the loss are saved; reconnect works | RO-029 part 3 |
| HW-23 | Switching sensors during a slow handshake (Codex rounds 3–4 on PR #28) | Switch to Simulated, then back to the same sensor: the new connection is never cut by the old one | RO-029 part 3 |
| HW-24 | Rate and loss over BLE: 10 min | Packet loss and the actual rate are reported; gaps are flagged | RO-029 |

## App data (phone, no sensor needed — listed because it needs the owner's device)

| ID | Test | Pass criteria | Task / PR |
|---|---|---|---|
| APP-01 | Database upgrade v1 → v2 on the phone with existing History (Milestone 3 plan §5 criterion 9) | The app opens; History shows the same sets; a new simulated set records and saves | RO-013 part 2 |
| APP-02 | Milestone 4 Expo Go acceptance | `docs/plans/RO-014-milestone-4-plan.md` §4 passes | RO-014 |

## Integration needed before the H0-B/C stage
- **An export of a recording to `rep-trial-v1` JSON,** with the samples unchanged, so that bench recordings can be
  evaluated offline.
- **The app calling the detector's `finish()` at set end,** and reading `takeUnfinishedCycles()` (ADR 0009 §7).

Both are proposed as follow-up tasks. Neither exists yet.
