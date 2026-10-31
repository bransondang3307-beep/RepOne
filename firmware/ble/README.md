# BLE firmware backend — pending board selection

**There is no BLE firmware yet, by design.** The owner has not chosen a wireless board, and the Uno R3 has no
Bluetooth. Nothing here claims compatibility with any particular board. Pin numbers, radio stacks and power are all
left until a board is chosen.

## What already exists (portable, host-tested)

`firmware/lib/ImuStreamProtocol` provides:
- `encode_sample_packet` / `encode_device_info`;
- `max_samples_for_mtu`;
- `SampleBatcher`, which fills packets to the negotiated MTU with a 100 ms latency bound;
- `PacketSink`;
- the GATT UUIDs.

`firmware/lib/Mpu6050Raw` reads the IMU over Arduino `Wire`, if the chosen board's toolchain provides it.

## What the backend must do (spec: `docs/protocols/imu-stream-v1.md`)

1. **Advertise** the service UUID `19bc0001-bab5-4ddb-8e9c-8595137ac300`. A local name is optional and must be
   brand-neutral.
2. **Expose two characteristics.** Samples `…0002…` (notify); device info `…0003…` (read and notify, 20 bytes, from
   `encode_device_info`).
3. **When notifications are enabled on samples:**
   - read the negotiated ATT MTU; `n = max_samples_for_mtu(mtu)`;
   - if `n == 0`, set status 3 and notify device info;
   - otherwise call `batcher.begin(<random u16>, 0, ranges…, n, 100)`.
4. **Each sample period:**
   - read the IMU;
   - `batcher.add()`; when it returns true, or `batcher.due(now)` is true, `take_packet()` and notify it through a
     `PacketSink`;
   - if the notify queue refuses a packet, call `batcher.mark_overflow()` straight away. The next packet then
     carries DEVICE_OVERFLOW, and STREAM_START again if the refused packet opened the stream.
5. **When notifications are disabled, or the central disconnects:** call `batcher.end()`. Buffered samples are
   discarded, never sent later.
6. **Device serial:** the board's factory-unique ID, e.g. its BLE MAC address zero-extended to 8 bytes.
7. **IMU errors:** set the status and notify device info (1 = not found at start, 2 = read failed while streaming).

## Board capabilities required

See spec §13:
- BLE 4.2+ peripheral with notifications, MTU ≥ 31 (ideally ≥ 185);
- an I²C controller;
- a unique hardware ID;
- about 1 KB of RAM for the buffer;
- a maintained toolchain that can compile the portable C++.
