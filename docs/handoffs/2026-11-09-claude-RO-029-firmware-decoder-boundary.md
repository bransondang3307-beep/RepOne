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
  - a deterministic synthetic sample sequence;
  - options for packet capacity, a refused packet, an IMU failure and restart, and the start time.
- **`firmware/tools/firmware-to-decoder.test.mjs`:** builds the emitter with the host C++ compiler, decodes its
  output with `decode-serial-capture.mjs`, and runs five scenarios:

  | Scenario | Expected |
  |---|---|
  | Uno-style (1 sample/packet, 100 samples) | Continuous; 50 Hz measured; serial and units as encoded |
  | BLE-style (5/packet) across the `millis()` wrap | Continuous; time strictly increasing |
  | A refused mid-stream packet | `samples_lost` 5 and `device_overflow`; only the next sample flagged |
  | A refused first packet | The stream restarts and nothing is dropped as stale |
  | `E 2` then a new stream | `stream_restarted`; timing measured within each stream |

- **`package.json`:** `test:firmware` also runs this test (CI runs `test:firmware` on Linux).
- **`firmware/README.md`:** a note under "Host tests".

## Tests and checks
| Command | Result |
|---|---|
| `node --test firmware/tools/firmware-to-decoder.test.mjs` (with `--experimental-transform-types`) | 5/5 |
| Mutation: drop `mark_overflow`'s re-start of the stream (`ImuStreamProtocol.h`) | Test 4 fails, then passes once restored |
| `npm run test:firmware` | Protocol 62/62, driver 16/16, decoder 4/4, boundary 5/5 |

No regression was found: the firmware and the app agree on all five scenarios.

## Known limitations
Host-compiled C++ (g++) stands in for the Uno's avr-gcc. The sketch's own loop and `Serial` are mirrored, not
executed, and no hardware is involved.

## Next steps
None required. The physical capture procedure (`firmware/README.md`) stays the owner's, after RO-018.
