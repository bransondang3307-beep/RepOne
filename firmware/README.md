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
| `test/host/` | Host tests: the portable layer against the shared golden packets | a C++17 compiler |

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

The result in this environment: **9,452 bytes of flash (29%) and 600 bytes of RAM (29%)**, with no warnings from
this code. That is a compile only; nothing was flashed.

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
- test `SampleBatcher`: stream start, sequence numbers, the latency flush across the `millis()` wrap, overflow
  flagging, and stale samples discarded on restart.

CI runs them on Linux.
