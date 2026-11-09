// Test helper, SYNTHETIC data only. It prints a serial capture the way the Uno R3 USB sketch (firmware/uno-usb) does:
// the same protocol library calls (SampleBatcher, encode_device_info, to_hex) and the same line format (`I <hex>`,
// `S <hex>`, `E <status> <text>`, `#` diagnostics). The samples are a deterministic synthetic sequence, so the app's
// serial decoder (firmware/tools/decode-serial-capture.mjs) can be run on firmware-produced bytes in a test.
//
// usage: emit_serial_capture <capacity 1-31> <samples> <start_ms> <refused_packet | -1> <restart_at_sample | -1>
//   capacity           samples per packet: 1 as on the Uno R3, more as on a BLE board
//   start_ms           device time of the first sample; near 4294967295 to cross the millis() wrap
//   refused_packet     index of a taken packet the transport refuses (not printed; mark_overflow is called)
//   restart_at_sample  before this sample, the IMU "fails" and recovers: `E 2`, then a new stream
#include <stdio.h>
#include <stdlib.h>

#include "ImuStreamProtocol.h"

namespace {

uint8_t packet[imu::kMaxPacketBytes];
char hexLine[2 * imu::kMaxPacketBytes + 1];

void printHexLine(char prefix, const uint8_t* data, size_t len) {
  if (imu::to_hex(hexLine, sizeof hexLine, data, len) == 0) {
    fprintf(stderr, "to_hex failed\n");
    exit(2);
  }
  printf("%c %s\n", prefix, hexLine);
}

bool beginStream(imu::SampleBatcher& batcher, uint16_t streamId, uint8_t capacity) {
  if (!batcher.begin(streamId, 0, 0, 0, capacity, 100)) return false;
  printf("# imu ok (WHO_AM_I=0x68); stream 0x%X at 50 Hz, +-2 g, +-250 dps\n", static_cast<unsigned>(streamId));
  return true;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 6) {
    fprintf(stderr, "usage: emit_serial_capture <capacity> <samples> <start_ms> <refused_packet|-1> <restart_at|-1>\n");
    return 2;
  }
  const int capacity = atoi(argv[1]);
  const int total = atoi(argv[2]);
  const uint32_t startMs = static_cast<uint32_t>(strtoul(argv[3], nullptr, 10));
  const int refusedPacket = atoi(argv[4]);
  const int restartAt = atoi(argv[5]);
  if (capacity < 1 || capacity > imu::kMaxSamples || total < 1) {
    fprintf(stderr, "capacity must be 1-31 and samples at least 1\n");
    return 2;
  }

  static imu::RawSample storage[imu::kMaxSamples];
  imu::SampleBatcher batcher(storage, static_cast<uint8_t>(capacity));

  // A configured serial (all zeros would be refused by the app), firmware 0.1, 50 Hz, one IMU, status OK.
  const imu::DeviceInfo info = {{0x00, 0x00, 0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6}, 1, 0, 0, 50, 0, 1, imu::kStatusOk};
  uint8_t infoBytes[imu::kDeviceInfoBytes];
  const size_t infoLen = imu::encode_device_info(infoBytes, sizeof infoBytes, info);
  if (infoLen == 0) return 2;
  printf("# imu stream firmware 0.1 (host emitter, synthetic), protocol v1\n");
  printHexLine('I', infoBytes, infoLen);
  if (!beginStream(batcher, 0x1234, static_cast<uint8_t>(capacity))) return 2;

  int taken = 0;
  auto takeAndSend = [&]() {
    const size_t len = batcher.take_packet(packet, sizeof packet);
    if (len == 0) return;
    if (taken++ == refusedPacket) {
      batcher.mark_overflow();  // the transport refused this packet: it is lost, and the next one says so
      return;
    }
    printHexLine('S', packet, len);
  };

  for (int i = 0; i < total; i++) {
    if (i == restartAt) {
      // As the sketch does when a read fails mid-stream: the stream ends, and a recovered IMU starts a new one.
      batcher.end();
      printf("E 2 imu read failed while streaming\n");
      if (!beginStream(batcher, 0x5678, static_cast<uint8_t>(capacity))) return 2;
    }
    imu::RawSample s;
    s.device_time_ms = startMs + static_cast<uint32_t>(20 * i);  // 50 Hz; unsigned, so it wraps at 2^32 like millis()
    s.accel[0] = static_cast<int16_t>(10 * i);
    s.accel[1] = -20;
    s.accel[2] = 16384;  // +1 g on z at ±2 g
    s.gyro[0] = 131;     // +1 °/s on x at ±250 °/s
    s.gyro[1] = 0;
    s.gyro[2] = -131;
    const bool ready = batcher.add(s);
    if (ready || batcher.due(s.device_time_ms)) takeAndSend();
  }
  if (!batcher.empty()) takeAndSend();  // flush the tail, as the latency bound would
  return 0;
}
