# Rep-detection capture and labelling protocol (bench, rotational)

> **Status: proposed, not yet run.** No real recording exists (source of truth §2). Written for RO-032 /
> [ADR 0009](../decisions/0009-pause-aware-rep-cycle-semantics.md). Results produced with it must be reported as
> **sensor** data, separately from the synthetic suite.

## 1. Safety and setup

- Use a **controlled, unloaded bench rig only**. Never use active gym equipment, a loaded machine, or a mount that
  has not been reviewed (source of truth §3.1, §4).
- **Rig:** a rigid lever on a single hinge, for example a board on a door hinge clamped to a table. Mark two angles on
  it: the start stop and the full-ROM stop (e.g. 0° and 70°). Add a midpoint mark at 50 %.
- **Sensor:** the H0 MPU-6050 (RO-018), taped or clamped rigidly to the lever. Wires must have slack for the full
  travel.
- **Orientation:**
  - Mount it so the **hinge axis is horizontal**. Gravity is then observable (ADR 0009 §3).
  - Optionally, run one extra session with the hinge axis vertical, to measure the gyro-only fallback.
  - Photograph the mount (no gym or identifying content) and note which sensor axis lies along the hinge.
- **Repeatable start:** every trial starts with the lever resting against the start stop for at least 3 s.

## 2. Recording format

- Record with whichever capture path exists (RO-029 USB or BLE). Convert to the unchanged raw-sample contract
  `RawSensorSample`:
  - `timestamp_ms`: device milliseconds;
  - `accel_m_s2`: m/s²;
  - `gyro_rad_s`: rad/s;
  - `quality_flags`: never include `synthetic`.
- Save one **trial** per file in the `rep-trial-v1` format (`packages/rep-engine/src/trialEvaluation.ts`):

```json
{
  "format": "rep-trial-v1",
  "trial_id": "bench-2026-11-10-t07",
  "scenario": "midway-pause",
  "provenance": "sensor",
  "split": "evaluation",
  "calibration": { "calibration_id": "bench-cal-2026-11-10", "axis": 0, "gyro_bias_rad_s": [0, 0, 0],
                   "full_rom_rad": 1.2217, "provenance": "user_reference_rep", "created_at_epoch_ms": 0 },
  "samples": [ { "timestamp_ms": 0, "source_id": "imu-…-ch0", "accel_m_s2": [0, 0, 9.81],
                 "gyro_rad_s": [0, 0, 0], "quality_flags": [] } ],
  "labels": {
    "cycles": [ { "start_ms": 3120, "end_ms": 7480, "classification": "full" } ],
    "stills": [ { "start_ms": 0, "end_ms": 3120, "kind": "hold" },
                { "start_ms": 4010, "end_ms": 5530, "kind": "pause" } ],
    "method": "owner; video at 30 fps, synced by tap at t=0"
  }
}
```

- `npm run evaluate:trials -w @repone/rep-engine -- --write-synthetic <dir>` writes the synthetic suite in the same
  format, as worked examples. They are labelled synthetic.

## 3. Calibration (once per session, before the trials)

1. Rest the lever against the start stop for 3 s (bias).
2. Make one deliberate full rep to the full-ROM stop and back.
3. Build the calibration with `calibrateFromReferenceRep`, using `provenance: "user_reference_rep"`. Store it in each
   trial of that session.

## 4. Trials (each starts and ends with ≥ 3 s at rest on the start stop)

| Scenario id | Movement | Reps / trial | Purpose |
|---|---|---|---|
| `continuous` | Full reps, ~2 s each, 1 s rest between | 8 | Baseline |
| `continuous-slow` | Full reps, ~6 s each | 5 | Slow movement |
| `continuous-fast` | Full reps, ~1 s each | 8 | Fast movement, touch-and-go |
| `midway-pause` | Up to the 50 % mark, hold 2 s, on to full, back | 6 | **Owner requirement** |
| `multi-pause` | Pauses at 30 %, 60 %, the top, and at 50 % on the way down | 4 | Multiple pauses |
| `top-hold` | Up to full, hold 5 s, back | 4 | Pause near an endpoint |
| `long-pause` | Up to 50 %, hold 15 s, on to full, back | 3 | Long-cycle policy (ADR 0009 §2.6) |
| `partial` | Up to the 50 % mark and back, then one full rep | 4 + 4 | Partial vs full |
| `hold-jitter` | Hold the lever by hand at start for 10 s, then at 50 % for 10 s, without deliberate motion | 0 + 1 | False counts during holds |
| `end-incomplete` | Two full reps, then stop at 70 % and end the recording there | 2 | Incomplete at session end |

- **Speeds:** use a metronome; record the bpm in `notes`.
- **Repetitions:** at least 3 sessions on different days, with the sensor re-mounted each time, to measure mounting
  variation.

## 5. Labelling reference events

- **Primary:** film the lever side-on at ≥ 30 fps with the start and full marks in view.
  - Sync the video by tapping the lever once, sharply, at the start. The tap appears as a spike in both the video and
    the gyro.
  - Label from the frames:
    - cycle `start_ms`: first frame the lever leaves the start stop;
    - cycle `end_ms`: first frame it is back at rest on the stop;
    - `classification`: `full` if it reached the full mark, `partial` if not, `incomplete` if the recording ended
      mid-cycle;
    - `stills`: `pause` inside a cycle, `hold` between cycles.
- **Fallback:** a printed metronome schedule that the operator follows, plus spoken markers on the video audio. Record
  the method in `labels.method`.
- Label **before** running the detector on the trial, and never edit labels after seeing detector output. If a label
  is wrong, fix it and note why in `notes`.

## 6. Tuning and evaluation splits (decide before recording)

- Assign `split` per session in advance, e.g. session 1 → `tuning`, sessions 2–3 → `evaluation`. Never assign by
  results.
- Thresholds may be changed only by looking at `tuning` trials. Evaluation results are reported once per detector
  version. After any threshold change, the old evaluation trials become tuning data, and **new** evaluation trials are
  required for an independent claim.
- The evaluator reports each provenance and split in its own section and prints the caveats.

## 7. Running the evaluation

```bash
npm run evaluate:trials -w @repone/rep-engine -- data/bench/2026-11-10 --split evaluation
```

- Add `--json` for machine-readable output.
- Add `--detector legacy` to compare against the frozen 0.1.0 copy.
- Add `--synthetic` to include the built-in synthetic suite, reported separately.
- Recordings are personal data only if they carry health context. Bench lever traces do not, but keep the files out
  of the repository unless the owner approves a small, permission-safe sample (source of truth §6 `data/samples/`).

Report, per scenario and in total:
- full-rep precision and recall;
- false counts during holds and events during pauses;
- missed reps;
- full/partial classification errors;
- completion timing (signed error against the labelled end, and the count outside ±500 ms);
- unfinished cycles.

**Expected bias:** completion fires on entering the 10 % return band, so it is early by the time the lever takes to
cover the last 10 % of travel.

## 8. What would count as evidence

- **The owner requirement is physically supported** if `midway-pause` and `multi-pause` evaluation trials show zero
  extra full reps and zero events during pauses, with all reps detected.
- Report failures by scenario with their trial ids. The source-of-truth targets (≥ 95 % full-rep agreement) are
  aspirational criteria, not current results.
