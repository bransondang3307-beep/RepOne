# Handoff — RO-029 part 2: firmware (Uno R3 USB bring-up, portable protocol layer; BLE backend pending)

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-10-31 |
| **Task** | RO-029 (owner-directed 2026-10-31) |
| **Branch** | `claude/RO-029-firmware` (base: `claude/RO-029-ble-sensor-pipeline`, part 1) |
| **Commits** | see the PR |
| **Pull request** | see the PR |
| **Status** | implemented · **compiled** (Uno R3) · host-tested · **not physically verified** |

## Objective
Prepare the firmware side of the real-sensor pipeline:
- a Uno R3 USB bring-up that reads the MPU-6050, reports failures, and streams timestamped six-axis readings with
  sequence numbers in the ADR 0008 protocol;
- a portable acquisition and protocol layer for a later BLE board, with the BLE hardware backend left pending the
  board choice.

## What changed
- **`firmware/lib/ImuStreamProtocol`** (portable C++11, no Arduino):
  - the encoders, CRC-16 and hex lines;
  - `max_samples_for_mtu`;
  - `SampleBatcher`, which:
    - numbers every sample taken, so a dropped sample leaves a visible gap;
    - sets STREAM_START on a new stream's first packet;
    - sets DEVICE_OVERFLOW on the packet after a drop;
    - flushes within a latency bound, also across the `millis()` wrap;
    - discards buffered samples when a stream ends;
    - uses caller-sized storage: 1 sample on the Uno, up to 31 on a BLE board;
  - the `PacketSink` interface;
  - the GATT UUIDs.
- **`firmware/lib/Mpu6050Raw`** (Arduino `Wire`):
  - accepts only `WHO_AM_I` = 0x68; any other value is reported, not accepted;
  - wakes the chip with the PLL clock and sets the DLPF, the sample-rate divider and the ranges;
  - burst-reads the six axes, skipping temperature;
  - reports I²C errors as `false`.
- **`firmware/uno-usb`:**
  - 50 Hz, ±2 g, ±250 °/s, DLPF ≈ 20 Hz below the 25 Hz Nyquist limit;
  - one sample per `S <hex>` line, `I <hex>` device info (at boot, on status changes and every 10 s), `E <status>`
    errors, and a once-a-second `#` readout (diagnostic only);
  - retries an IMU that isn't found or fails mid-stream, starting a new stream when it recovers;
  - a 3 ms `Wire` timeout;
  - the per-board serial is set in `device_config.h`, and the firmware warns if it is unset;
  - no wiring instructions (voltage and pull-ups are unverified; RO-018).
- **`firmware/ble/README.md`:** the backend's duties and the board capabilities required. No code, and no board
  assumed.
- **`firmware/test/host`** and **`npm run test:firmware`:** generate a C++ header from the shared golden packets and
  the app's UUIDs, then compile and run the host tests. **CI** runs them on Linux.
- **Docs:** `firmware/README.md`; the `docs/hardware-protocol.md` status line; the `README.md` layout.

## Files changed
- `firmware/**` — added
- `docs/handoffs/2026-10-31-claude-RO-029-firmware.md` — added
- `package.json` (the `test:firmware` script), `.github/workflows/ci.yml` (one Linux step), `README.md`,
  `docs/hardware-protocol.md` — modified

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm run test:firmware` (g++ 13.3, `-std=c++17 -Wall -Wextra -Werror`), after review round 1 | Protocol layer **62/62 checks** (6 golden sample packets and 2 golden device-info packets reproduced byte for byte; UUIDs match the app). MPU-6050 driver against a fake `Wire` bus **16/16** |
| Round-1 regression test (STREAM_START after a refused first packet) on the round-0 code | fails, as Codex reproduced; passes with the fix |
| The same, before the overflow fix (found by these tests) | 56/57: DEVICE_OVERFLOW landed on the packet *before* the gap. Fixed, and an assertion added |
| `arduino-cli compile --fqbn arduino:avr:uno --warnings all` (arduino-cli 1.3.1, `arduino:avr` 1.8.6 from git tag `1.8.6` @ `42fa4a1`, avr-gcc 7.3.0 from Ubuntu, universal-ctags 5.9) | **exit 0**. Sketch 9,462 bytes (29% of 32,256); globals 601 bytes (29% of 2,048), after round 1. The only warnings come from the core's own `new.cpp` |
| `npm run check:workflows` | OK |
| `npm run verify` (Node 22.22.0) | exit 0. Boundaries OK (85 files); workflow policy OK; typecheck OK; script tests 67/67; Jest 241/241 (after merging part 1 round 1) |

**Environment notes.** `downloads.arduino.cc` is blocked by this environment's network policy, so the AVR core came
from its official GitHub repository (tag 1.8.6), and avr-gcc from Ubuntu's `gcc-avr` package (7.3.0, the same
compiler version the Arduino IDE ships).

**Not done:** nothing was flashed or run on an Uno R3 or MPU-6050, and there is no BLE firmware.

## Decisions / ADRs
- It implements ADR 0008 (Proposed). DLPF 4, the sample-rate divider 0 and the 100 kHz I²C clock are firmware
  choices within that proposal; RO-016 or the owner may revisit them with H0 evidence.

## Known limitations / risks
- **Polling, not the FIFO.** It samples by polling with `millis()`, not with the MPU-6050's FIFO or data-ready
  interrupt, so timing jitter is about ±1 ms. FIFO or interrupt timing is a possible later improvement, after H0
  measurements.
- **Nominal sensitivities** in the `#` readout; diagnostic only.
- **Uno RAM is tight** (2 KB), so batches are one sample per line over USB.
- **Ubuntu's avr-gcc** packaging differs from the Arduino IDE's toolchain build. The owner's IDE compile is the
  authoritative one.

## Next steps
- **Owner (RO-018):** verify the parts, set `IMU_DEVICE_SERIAL`, flash, and capture the serial output. The
  acceptance checklist is in the PR.
- **Part 3:** the iPhone BLE adapter.
- **After the board choice:** the BLE backend described in `firmware/ble/README.md`.
