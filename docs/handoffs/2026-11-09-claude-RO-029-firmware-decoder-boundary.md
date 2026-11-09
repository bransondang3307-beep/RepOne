# Handoff — RO-029: firmware → decoder cross-boundary regression on whole streams (test only)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-09 |
| **Task** | RO-029 (owner-directed), independent software work while the phone checks are deferred |
| **Branch** | `claude/RO-029-firmware-decoder-boundary-test` (base: `main` @ `f16f914`) |
| **Pull request** | the PR that adds this file |
| **Status** | tests only; verified locally (below). **Synthetic data**; nothing flashed, no hardware |

## Objective
The owner asked (2026-11-09) for a check at an untested boundary between the merged firmware, the packet decoder and
the serial-capture path, after looking for equivalent coverage.

**Coverage before this PR:**
- each packet's bytes: the C++ encoder against the golden packets, compared with `to_hex`;
- each line: the TypeScript decoder on golden hex.

**The gap:** nothing ran a **stream** produced by the firmware's `SampleBatcher` through the app's `StreamTracker`.
That covers sequence numbers across packets, the stream-start flag, `mark_overflow` and restarts. A mismatch there
would show up only on hardware, as lost or stale samples.

## What changed
- **`firmware/test/host/emit_serial_capture.cpp`:** prints a serial capture as the Uno sketch does:
  - the same library calls (`SampleBatcher`, `encode_device_info`, `to_hex`);
  - the same lines (`I`, `S`, `E 2`, `#`);
  - the sketch's `setStatus`: on an IMU failure, `E 2` and a device-info packet with status 2; on recovery, after
    the sketch's `kRetryMs` (2000 ms), a new stream and a device-info packet with status 0;
  - a deterministic synthetic sample sequence, with a different value on every axis of every sample;
  - options for packet capacity, a refused packet, an IMU failure and restart, and the start time.
- **`firmware/tools/firmware-to-decoder.test.mjs`:** builds the emitter with the host C++ compiler, decodes its
  output with `decode-serial-capture.mjs`, and runs five scenarios:

  | Scenario | Expected |
  |---|---|
  | Uno-style (1 sample/packet, 100 samples) | Continuous; 50 Hz measured; serial and units as encoded |
  | BLE-style (5/packet) across the `millis()` wrap | Continuous; time strictly increasing |
  | A refused mid-stream packet | `samples_lost` 5 and `device_overflow`; only the next sample flagged |
  | A refused first packet | The stream restarts and nothing is dropped as stale |
  | An IMU failure and recovery | Lines in the sketch's order; device-info statuses 0, 2, 0; `stream_restarted`; 2 s of downtime between streams, yet 50 Hz measured within each stream |

  In every scenario, each decoded sample's device time and all six axes match the synthetic sequence. The SI values
  are computed in the test from the datasheet scales, not with the decoder's own unit code.

- **`package.json`:** `test:firmware` also runs this test (CI runs `test:firmware` on Linux).
- **`firmware/README.md`:** a note under "Host tests".

## Tests and checks
| Command | Result |
|---|---|
| `node --test firmware/tools/firmware-to-decoder.test.mjs` (with `--experimental-transform-types`) | 5/5 |
| Mutation: drop `mark_overflow`'s re-start of the stream (`ImuStreamProtocol.h`) | Test 4 fails, then passes once restored |
| Mutation (Codex round 1): zero every buffered sample's `accel[0]` in `SampleBatcher::add` | All 5 fail |
| Mutation (Codex round 1): swap gyro y and z in `encode_sample_packet` | All 5 fail |
| Mutation (Codex round 1): measure the decoder's rate first-to-last across streams | Test 5 fails |
| `npm run test:firmware` | Protocol 62/62, driver 16/16, decoder 4/4, boundary 5/5 |

Codex round 1 (2026-11-09) raised three P2s, fixed in this PR:
- the payload was barely checked; now every axis of every sample is;
- recovery had no downtime, so the rate check could not tell per-stream timing from first-to-last timing;
- the device-info status transitions on failure and recovery were missing.

Codex reported that the zeroed-`accel[0]` mutation and the first-to-last rate mutation passed the tests before this
fix. They are now caught, as is the gyro swap. All tests pass again once each mutation is restored.

No regression was found: the firmware and the app agree on all five scenarios.

## Known limitations
Host-compiled C++ (g++) stands in for the Uno's avr-gcc. The sketch's own loop and `Serial` are mirrored, not
executed, and no hardware is involved.

## Next steps
None required. The physical capture procedure (`firmware/README.md`) stays the owner's, after RO-018.
