// Test helper, SYNTHETIC data only. It prints a serial capture the way the Uno R3 USB sketch (firmware/uno-usb) does:
// the same protocol library calls (SampleBatcher, encode_device_info, to_hex) and the same line format (`I <hex>`,
// `S <hex>`, `E <status> <text>`, `#` diagnostics). The samples are a deterministic synthetic sequence, so the app's
// serial decoder (firmware/tools/decode-serial-capture.mjs) can be run on firmware-produced bytes in a test.
//
// usage: emit_serial_capture <capacity 1-31> <samples> <start_ms> <refused_packet | -1> <restart_at_sample | -1>
//   capacity           samples per packet: 1 as on the Uno R3, more as on a BLE board
//   start_ms           device time of the first sample; near 4294967295 to cross the millis() wrap
//   refused_packet     index of a taken packet the transport refuses (not printed; mark_overflow is called)
//   restart_at_sample  the IMU read for this sample's slot fails, as in the sketch's loop(): the stream ends, `E 2`
//                      and a device-info packet with status 2 are printed, and after the sketch's kRetryMs (2000 ms)
//                      the IMU recovers: a new stream starts and a device-info packet with status 0 follows. The
//                      sample with this index is the new stream's first, read 2000 ms after the failed slot.
//
// Sample i (counting delivered samples, i.e. excluding the failed read) has device time start_ms + 20 i, plus
// kRetryMs from restart_at_sample on, and a distinct value on every axis (sampleAt below), so a test can check every
// axis of every decoded sample against this sequence.
#include <stdio.h>
#include <stdlib.h>

#include "ImuStreamProtocol.h"

namespace {

const uint32_t kPeriodMs = 20;    // 50 Hz, as the sketch
const uint32_t kRetryMs = 2000;   // as the sketch: the delay before a failed IMU is started again

uint8_t packet[imu::kMaxPacketBytes];
char hexLine[2 * imu::kMaxPacketBytes + 1];
// A configured serial (all zeros would be refused by the app), firmware 0.1, 50 Hz, one IMU, status OK.
imu::DeviceInfo info = {{0x00, 0x00, 0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6}, 1, 0, 0, 50, 0, 1, imu::kStatusOk};

void printHexLine(char prefix, const uint8_t* data, size_t len) {
  if (imu::to_hex(hexLine, sizeof hexLine, data, len) == 0) {
    fprintf(stderr, "to_hex failed\n");
    exit(2);
  }
  printf("%c %s\n", prefix, hexLine);
}

// As the sketch's sendInfo() and setStatus(): an error prints `E <status> <text>`, and a status change updates the
// device-info packet and sends it again.
void sendInfo() {
  uint8_t bytes[imu::kDeviceInfoBytes];
  const size_t len = imu::encode_device_info(bytes, sizeof bytes, info);
  if (len == 0) {
    fprintf(stderr, "encode_device_info failed\n");
    exit(2);
  }
  printHexLine('I', bytes, len);
}

void setStatus(uint8_t status, const char* message) {
  if (status != imu::kStatusOk) printf("E %u %s\n", static_cast<unsigned>(status), message);
  if (info.status != status) {
    info.status = status;
    sendInfo();
  }
}

// As the sketch's startImu() once the IMU answers: a new stream, the `# imu ok` line, then status OK.
bool beginStream(imu::SampleBatcher& batcher, uint16_t streamId, uint8_t capacity) {
  if (!batcher.begin(streamId, 0, 0, 0, capacity, 100)) return false;
  printf("# imu ok (WHO_AM_I=0x68); stream 0x%X at 50 Hz, +-2 g, +-250 dps\n", static_cast<unsigned>(streamId));
  setStatus(imu::kStatusOk, "");
  return true;
}

// Delivered sample i: every axis changes with i, at a different rate, so a dropped, zeroed or swapped axis shows.
imu::RawSample sampleAt(int i, uint32_t deviceTimeMs) {
  imu::RawSample s;
  s.device_time_ms = deviceTimeMs;
  s.accel[0] = static_cast<int16_t>(10 * i);
  s.accel[1] = static_cast<int16_t>(-20 - 7 * i);
  s.accel[2] = static_cast<int16_t>(16384 - 3 * i);  // about +1 g on z at ±2 g
  s.gyro[0] = static_cast<int16_t>(131 + 11 * i);    // about +1 °/s on x at ±250 °/s
  s.gyro[1] = static_cast<int16_t>(-13 * i);
  s.gyro[2] = static_cast<int16_t>(-131 + 5 * i);
  return s;
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
  if (capacity < 1 || capacity > imu::kMaxSamples || total < 1 || total > 1000) {
    fprintf(stderr, "capacity must be 1-31 and samples 1-1000\n");
    return 2;
  }
  if (restartAt >= 0 && capacity != 1) {
    fprintf(stderr, "an IMU failure is modelled on the Uno sketch only: capacity must be 1\n");
    return 2;
  }

  static imu::RawSample storage[imu::kMaxSamples];
  imu::SampleBatcher batcher(storage, static_cast<uint8_t>(capacity));

  printf("# imu stream firmware 0.1 (host emitter, synthetic), protocol v1\n");
  sendInfo();  // as the sketch's setup(), before the IMU is started
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

  uint32_t downtimeMs = 0;
  for (int i = 0; i < total; i++) {
    // 50 Hz; unsigned, so it wraps at 2^32 like millis().
    uint32_t now = startMs + kPeriodMs * static_cast<uint32_t>(i) + downtimeMs;
    if (i == restartAt) {
      // As the sketch's loop() when the read for this slot fails: the stream ends, the error and the status change
      // are reported, and kRetryMs later the IMU is started again with a new stream. (Capacity is 1 here, as on the
      // Uno, so nothing is left buffered when the stream ends.)
      batcher.end();
      setStatus(imu::kStatusImuReadFailed, "imu read failed while streaming");
      downtimeMs += kRetryMs;
      now += kRetryMs;
      if (!beginStream(batcher, 0x5678, static_cast<uint8_t>(capacity))) return 2;
    }
    const imu::RawSample s = sampleAt(i, now);
    const bool ready = batcher.add(s);
    if (ready || batcher.due(s.device_time_ms)) takeAndSend();
  }
  if (!batcher.empty()) takeAndSend();  // flush the tail, as the latency bound would
  return 0;
}
