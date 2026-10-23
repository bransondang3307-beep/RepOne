# Handoff — RO-012 part 2: per-channel rep engine

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-23 |
| **Task** | RO-012 (`TASKS.md`), Milestone 2, part 2 of 4 |
| **Branch** | `claude/RO-012-channel-rep-engine`, **stacked on part 1** (`claude/RO-012-sensor-error-states`, PR #14) |
| **Commits** | `62ca9e0` RO-012: per-channel rep engine (MultiChannelRepDetector) with channel-independence tests (part 2) · then a commit recording the PR link |
| **Pull request** | [PR #15](https://github.com/bransondang3307-beep/RepOne/pull/15), stacked: it targets `claude/RO-012-sensor-error-states` until PR #14 merges |
| **Status** | implemented; verified locally; awaiting Codex review. Merge after PR #14 |

## Objective
Add the per-channel rep-engine wrapper from ADR 0007 §3: several IMUs in one session, each detected independently,
without changing the detection algorithm.

## What changed
- **`@repone/rep-engine`: `MultiChannelRepDetector`** (new file `src/MultiChannelRepDetector.ts`, exported from
  `src/index.ts`).
  - It implements `MotionDetector<ChannelRepEvent>` and routes each `RawSensorSample` by `source_id` to that channel's
    own detector.
  - The detector is `RotationalRepDetector` with that channel's calibration, or one from an injected factory.
  - It returns `{ source_id, event }`. `RepEvent` is unchanged.
  - Detectors are created up front, so a bad calibration throws immediately. Every channel must share one algorithm
    version.
  - Samples from unknown channels are ignored and counted. `resetChannel()` resets one channel only.
- **Why it is needed:** the bare detector ignores any sample whose timestamp isn't newer than the previous one, and
  integrates across whatever it receives. Two IMUs with independent clocks fed into one detector corrupt each other. A
  test demonstrates this.
- **Docs:**
  - ADR 0007: status updated; decision 3 → implemented.
  - `docs/architecture.md`: module C row.
  - `TASKS.md`: the RO-012 row and plan, with PR #14 linked and part 2's branch.
- **Unchanged:**
  - `RotationalRepDetector`, its thresholds, units and `algorithm_version`;
  - `RepEvent` and the sensor contract;
  - the database schema;
  - the app. It still records one channel per session; app integration is part 4.

## Files changed
- `packages/rep-engine/src/MultiChannelRepDetector.ts` — added
- `packages/rep-engine/src/index.ts` — modified
- `packages/rep-engine/test/multiChannelRepDetector.test.ts` — added
- `docs/decisions/0007-sensor-errors-channels-device-connections.md`, `docs/architecture.md`, `TASKS.md` — modified
- `docs/handoffs/2026-10-23-claude-RO-012-channel-rep-engine.md` — added

## Tests and checks (exact results)
**Channel-independence tests.** All data is synthetic. Two channels interleaved round-robin:

| Channel | Script | Rotation axis | Seed | Clock |
|---|---|---|---|---|
| A | labelled set | x | 42 | starts at 0 |
| B | its own 3-rep script | y | 7 | offset by 250 s |

| Test | Asserts |
|---|---|
| Single channel | Equals the bare detector's events exactly (8 full, 2 partial) |
| Two channels | Each equals its own channel run alone, with its own calibration ID; B gives 2 full, 1 partial |
| Bare detector fed both channels | Does **not** equal A alone |
| Gap on A (6–7 s removed) | B unchanged; A equals A-with-gap alone |
| A stops at 5 s (like a lost connection) | B unchanged |
| A at gyro noise 0.12 rad/s | B unchanged |
| `resetChannel('imu-a')` while B is mid-rep | B unchanged; the test first checks that B really is mid-rep at that point |
| Unknown channel | Ignored and counted; no events |
| Constructor validation | Rejects an empty channel list, an invalid calibration and mixed algorithm versions |

| Command | Result |
|---|---|
| `npm run verify` (Linux, Node 22.22.0) | exit 0. Boundaries OK (60 files, no circular imports); workflow policy OK; typecheck OK; Jest **79/79**: mobile 19, rep-engine **25** (was 16), sensor-contracts 31, workout-domain 4 |
| `npm run test:scripts` | tests 62, pass 62, fail 0 |

Negative controls (run, then reverted):
- **All channels routed to one detector:** 5 of 9 wrapper tests fail.
- **`resetChannel()` resetting every channel:** 1 test fails. This needed the mid-rep version of the reset test; the
  first version reset while B was at rest and missed it.

**Expo export:** not re-run. Part 2 changes no app code, and part 1's exports passed.

## Decisions / ADRs
- ADR 0007 decision 3 implemented. Decision 2 (channel = `source_id`) is used by the wrapper and still awaits the
  owner's confirmation. An explicit channel index later would change only how samples are routed.

## Known limitations / risks
- **Stacked PR.** Merge PR #14 first. Afterwards this PR is retargeted to `main` (GitHub does it automatically if part
  1's branch is deleted; otherwise I will).
- **Channel not stored.** Persisting the channel on `rep_events` is Milestone 3 schema work. The app does not use the
  wrapper yet.
- **Synthetic data only.** Two-IMU behaviour has never been seen on hardware.

## Next steps
1. **Codex:** review the wrapper and the independence tests.
2. **Claude Code:** part 3, the `DeviceConnection` contract, `SimulatedDevice` (multi-channel) and the device contract
   suite.

## Questions for the owner
- Same as part 1: confirm ADR 0007 decision 2 (channel = `source_id`).
