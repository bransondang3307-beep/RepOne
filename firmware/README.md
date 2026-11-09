# Firmware (RO-029 part 2)

> **Status:** compiled and host-tested; **not physically verified.**
> - No Uno R3, GY-521 / MPU-6050 or BLE board has run this code. Physical bring-up is RO-018 (owner).
> - The protocol is **Proposed**: [ADR 0008](../docs/decisions/0008-imu-stream-wire-protocol.md),
>   [spec](../docs/protocols/imu-stream-v1.md).

## Layout

| Path | What | Depends on |
|---|---|---|
| `lib/ImuStreamProtocol/` | Portable protocol layer: packet and device-info encoders, CRC-16, hex lines, `SampleBatcher` (sequence numbers, stream start, overflow, MTU-sized batches, latency-bounded flush), `PacketSink` interface, GATT UUIDs | Nothing (C++11, no Arduino) |
| `lib/Mpu6050Raw/` | Minimal MPU-6050 register access: `WHO_AM_I` check, configuration, raw six-axis burst read | Arduino `Wire` |
| `uno-usb/` | **Uno R3 USB bring-up** sketch: streams protocol packets as hex lines over USB serial | both libraries |
| `ble/` | **BLE backend: pending** the owner's board choice. Interface and requirements only | — |
| `test/host/` | Host tests: the portable layer against the shared golden packets; the MPU-6050 driver against a fake `Wire` bus | a C++17 compiler |

Both libraries are standard Arduino libraries: `library.properties` plus a `src/` folder.

## Uno R3 USB bring-up (`uno-usb/`)

The Uno R3 has **no Bluetooth**. This sketch proves the sensor and the data path over USB:
- it reads the MPU-6050 at 50 Hz (±2 g, ±250 °/s, DLPF ≈ 20 Hz);
- it prints one protocol packet per sample as `S <hex>`, the same bytes a BLE board would notify;
- it prints device info as `I <hex>`, errors as `E <status> <text>`, and a once-a-second human-readable readout as
  `# …` (diagnostic only).

Before flashing:
- **Set `IMU_DEVICE_SERIAL`** in `uno-usb/device_config.h` to a value unique to this board. If you leave it all
  zeros, the firmware warns and the app rejects the device as unconfigured.
- **Check `IMU_I2C_ADDRESS`** (0x68 or 0x69) against the real breakout.

**What it does on failure:**
- **No IMU at start-up**, or a `WHO_AM_I` other than 0x68: it prints `E 1 …`, reports status 1 in an `I` line, and
  retries every 2 s. A different `WHO_AM_I` is printed but not accepted; the firmware does not claim compatibility
  with other parts.
- **An I²C read fails while streaming:** it prints `E 2 …` and reports status 2. The stream ends; once the IMU
  answers again, a new stream starts, with a new id and sequence 0.
- **A stuck I²C bus:** `Wire` has a 3 ms timeout, so the firmware reports an error instead of hanging.

**Wiring is deliberately not given here.** The breakout's supply voltage, its regulator and pull-ups, and the I²C
address must first be verified on the actual part (source of truth §4, RO-018).

### Build

The compile in RO-029 used:
- arduino-cli 1.3.1;
- the official Arduino AVR core **1.8.6** (`arduino:avr`, git tag `1.8.6`, commit `42fa4a1`);
- avr-gcc 7.3.0.

```bash
arduino-cli core install arduino:avr@1.8.6
cd firmware
arduino-cli compile --fqbn arduino:avr:uno --warnings all \
  --library lib/ImuStreamProtocol --library lib/Mpu6050Raw uno-usb
# then, with the board on a known port:
arduino-cli upload --fqbn arduino:avr:uno -p <PORT> uno-usb
arduino-cli monitor -p <PORT> -c baudrate=115200
```

In the **Arduino IDE** instead: copy `lib/ImuStreamProtocol` and `lib/Mpu6050Raw` into your sketchbook's
`libraries` folder, open `uno-usb/uno-usb.ino`, choose *Arduino Uno*, upload, and open the Serial Monitor at 115200
baud.

The result in this environment: **9,462 bytes of flash (29%) and 601 bytes of RAM (29%)**, with no warnings from
this code. That is a compile only; nothing was flashed.

### Capture and decode real output (H0 evidence)

After the parts and their supply voltage are verified (RO-018) and the sketch is flashed:

1. **Capture about 30 s:**
   - 10 s lying flat and still;
   - 10 s turning and moving the breakout;
   - 10 s still again.

   Save the serial output as text, in either of these ways:
   ```bash
   arduino-cli monitor -p <PORT> -c baudrate=115200 --quiet > capture.txt   # Ctrl+C after ~30 s
   ```
   or, in the Arduino IDE's Serial Monitor at 115200 baud, select all, copy and paste into `capture.txt`. Its
   timestamps are fine: the decoder ignores them.
2. **Decode it with the app's codec**, from the repository root (Node 22+):
   ```bash
   npm run decode:serial -- capture.txt --csv capture.csv
   ```
   It prints:
   - the line counts;
   - the device's own report (serial, firmware, nominal rate, status);
   - the firmware's `#` diagnostics, and every `E` line and unreadable line;
   - stream continuity (stream starts and restarts, lost or stale packets);
   - the measured rate, from device time;
   - mean and range of `|a|` (m/s²) and `|ω|` (°/s).

   `capture.csv` holds every sample in SI units, for plotting.
3. **What a healthy capture shows:**
   - your `IMU_DEVICE_SERIAL`, firmware 0.1, 50 Hz, status 0, and `# imu ok (WHO_AM_I=0x68)`;
   - one `stream_started`, with no `samples_lost` or `stream_restarted` unless you caused them;
   - a measured rate close to 50 Hz;
   - lying still: `|a|` close to 9.8 m/s², mostly on one axis, and `|ω|` near 0 °/s;
   - moving: the minimum and maximum of `|a|` spread out, and the maximum of `|ω|` rises. That shows the readings
     respond to movement; it is **not** a calibration, and it says nothing about rep-count accuracy.
   - At most the first line is unreadable (a capture that started mid-line).
4. **Send back:** the printed summary and `capture.txt`. That is the first physical evidence. Until then, the firmware
   is compiled and host-tested only.

The decoder's own tests (`firmware/tools/decode-serial-capture.test.mjs`, in `npm run test:firmware`) use synthetic
captures built from the golden packets.

## BLE backend (`ble/`): pending

See [`ble/README.md`](ble/README.md). The portable layer is ready for it. The board-specific part (radio stack, GATT
server, advertising, MTU) waits for the owner's choice of board; spec §13 lists the capabilities it needs.

## Host tests

```bash
npm run test:firmware        # needs a C++17 compiler (c++, or set CXX)
```

They:
- generate a header from `packages/sensor-protocol/fixtures/v1/golden-packets.json` (**synthetic** values);
- check that the firmware encoder reproduces every golden byte the app's TypeScript codec decodes;
- check that the GATT UUIDs equal the app's;
- test `SampleBatcher`: stream start (kept when the transport refuses the first packet), sequence numbers, the latency
  flush across the `millis()` wrap, overflow flagging, and stale samples discarded on restart;
- test the MPU-6050 driver against a scripted fake `Wire` bus (`test/host/fake_arduino/`): register addresses and
  values, repeated-start reads, signed big-endian decoding, temperature skipped, NACK and short-read failures. That
  is not real I²C.

They also check the firmware against the app's decoder on whole streams (`firmware/tools/firmware-to-decoder.test.mjs`).
`test/host/emit_serial_capture.cpp` prints a capture the way the Uno sketch does, from the same library calls and
line format with **synthetic** samples. The app's decoder and `StreamTracker` must then read it back for:
- one sample per packet (Uno) and five per packet (BLE-style);
- a refused packet;
- a refused first packet;
- an IMU failure: `E 2`, the status 2 and status 0 device-info packets, and a new stream after the sketch's 2 s retry;
- the 32-bit `millis()` wrap.

Every decoded sample's device time and six axes are compared with the synthetic sequence.

CI runs them on Linux.
