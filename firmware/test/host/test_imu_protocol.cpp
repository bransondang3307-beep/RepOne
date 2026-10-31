// Host tests for firmware/lib/ImuStreamProtocol. Built and run by run.mjs, which generates golden_fixtures.h from the
// shared (synthetic) golden packets. No hardware involved.
#include <cstdio>
#include <cstring>
#include <string>

#include "ImuStreamProtocol.h"
#include "golden_fixtures.h"

namespace {

int failures = 0;
int checks = 0;

void check(bool ok, const std::string& what) {
  checks++;
  if (!ok) {
    failures++;
    std::printf("FAIL: %s\n", what.c_str());
  }
}

std::string hex(const uint8_t* data, size_t len) {
  char buf[2 * imu::kMaxPacketBytes + 1];
  if (imu::to_hex(buf, sizeof buf, data, len) == 0) return "<to_hex failed>";
  return buf;
}

imu::RawSample sample(uint32_t t, int16_t z = 16384) {
  imu::RawSample s = {t, {0, 0, z}, {0, 0, 0}};
  return s;
}

void test_crc() {
  const char* text = "123456789";
  check(imu::crc16_ccitt_false(reinterpret_cast<const uint8_t*>(text), 9) == 0x29B1, "CRC-16/CCITT-FALSE check value");
}

void test_golden_sample_packets() {
  for (const GoldenSamples& g : kGoldenSamples) {
    uint8_t out[imu::kMaxPacketBytes];
    const size_t len = imu::encode_sample_packet(out, sizeof out, g.flags, g.accel_range, g.gyro_range, g.channel,
                                                 g.stream_id, g.first_sequence, g.samples, g.count);
    check(len == std::strlen(g.hex) / 2, std::string(g.name) + ": length");
    check(hex(out, len) == g.hex, std::string(g.name) + ": bytes equal the golden packet");
  }
}

void test_golden_device_info() {
  for (const GoldenInfo& g : kGoldenInfo) {
    uint8_t out[imu::kDeviceInfoBytes];
    const size_t len = imu::encode_device_info(out, sizeof out, g.info);
    check(len == imu::kDeviceInfoBytes, std::string(g.name) + ": length");
    check(hex(out, len) == g.hex, std::string(g.name) + ": bytes equal the golden packet");
  }
}

void test_uuids_match_app() {
  check(std::strcmp(imu::kServiceUuid, kAppServiceUuid) == 0, "service UUID equals the app's");
  check(std::strcmp(imu::kSamplesCharacteristicUuid, kAppSamplesUuid) == 0, "samples UUID equals the app's");
  check(std::strcmp(imu::kDeviceInfoCharacteristicUuid, kAppDeviceInfoUuid) == 0, "device-info UUID equals the app's");
}

void test_encoder_rejects_bad_input() {
  uint8_t out[imu::kMaxPacketBytes];
  imu::RawSample s[32] = {};
  check(imu::encode_sample_packet(out, sizeof out, 0, 0, 0, 0, 1, 0, s, 0) == 0, "0 samples rejected");
  check(imu::encode_sample_packet(out, sizeof out, 0, 0, 0, 0, 1, 0, s, 32) == 0, "32 samples rejected");
  check(imu::encode_sample_packet(out, sizeof out, 0, 4, 0, 0, 1, 0, s, 1) == 0, "accel range 4 rejected");
  check(imu::encode_sample_packet(out, sizeof out, 0, 0, 0, 16, 1, 0, s, 1) == 0, "channel 16 rejected");
  check(imu::encode_sample_packet(out, sizeof out, 0x80, 0, 0, 0, 1, 0, s, 1) == 0, "reserved flag rejected");
  check(imu::encode_sample_packet(out, 27, 0, 0, 0, 0, 1, 0, s, 1) == 0, "too-small output buffer rejected");
  check(imu::encode_sample_packet(out, sizeof out, 0, 0, 0, 0, 1, 0, s, 31) == imu::kMaxPacketBytes, "31 samples = 508 bytes");
  imu::DeviceInfo info = {{0, 0, 0, 0, 0, 0, 0, 1}, 0, 0, 0, 50, 0, 1, 0};
  check(imu::encode_device_info(out, sizeof out, info) == 0, "0 channels rejected");
  info.channel_count = 1;
  info.nominal_rate_hz = 0;
  check(imu::encode_device_info(out, sizeof out, info) == 0, "0 Hz rejected");
  char small[4];
  check(imu::to_hex(small, sizeof small, out, 2) == 0, "to_hex refuses a too-small buffer");
}

void test_mtu_table() {
  check(imu::max_samples_for_mtu(23) == 0, "MTU 23 -> 0 samples");
  check(imu::max_samples_for_mtu(30) == 0, "MTU 30 -> 0 samples");
  check(imu::max_samples_for_mtu(31) == 1, "MTU 31 -> 1 sample");
  check(imu::max_samples_for_mtu(185) == 10, "MTU 185 -> 10 samples");
  check(imu::max_samples_for_mtu(247) == 14, "MTU 247 -> 14 samples");
  check(imu::max_samples_for_mtu(517) == 31, "MTU 517 -> 31 samples");
}

void test_batcher_stream_start_and_sequence() {
  imu::RawSample storage[3];
  imu::SampleBatcher b(storage, 3);
  check(b.begin(0x1234, 0, 0, 0, 3, 100), "begin");
  uint8_t out[imu::kMaxPacketBytes];
  check(!b.add(sample(0)), "1st of 3 not ready");
  check(!b.add(sample(20)), "2nd of 3 not ready");
  check(b.add(sample(40)), "3rd of 3 ready");
  size_t len = b.take_packet(out, sizeof out);
  check(len == 12 + 16 * 3, "first packet has 3 samples");
  check(out[2] == imu::kFlagStreamStart, "first packet carries STREAM_START only");
  check(out[6] == 0 && out[7] == 0, "first sequence 0");
  b.add(sample(60));
  len = b.take_packet(out, sizeof out);
  check(len == 28 && out[2] == 0, "later packets carry no flags");
  check(out[6] == 3 && out[7] == 0, "sequence continues at 3");
  check(b.take_packet(out, sizeof out) == 0, "empty batcher yields no packet");
}

void test_batcher_time_flush() {
  imu::RawSample storage[5];
  imu::SampleBatcher b(storage, 5);
  b.begin(1, 0, 0, 0, 5, 100);
  b.add(sample(1000));
  check(!b.due(1099), "not due before flush_after_ms");
  check(b.due(1100), "due at flush_after_ms");
  b.add(sample(0xFFFFFFF0u));
  imu::SampleBatcher w(storage, 5);
  w.begin(1, 0, 0, 0, 5, 100);
  w.add(sample(0xFFFFFFF0u));
  check(w.due(0x00000054u), "due across the u32 millis() wrap");
}

void test_batcher_overflow_marks_gap() {
  imu::RawSample storage[2];
  imu::SampleBatcher b(storage, 2);
  b.begin(7, 0, 0, 0, 2, 100);
  b.add(sample(0));
  b.add(sample(20));
  check(b.add(sample(40)), "full buffer reports ready and drops the new sample");
  uint8_t out[imu::kMaxPacketBytes];
  b.take_packet(out, sizeof out);
  check(out[2] == imu::kFlagStreamStart, "the packet of samples taken before the drop is not flagged");
  b.add(sample(60));
  const size_t len = b.take_packet(out, sizeof out);
  check(len == 28, "next packet has the next sample");
  check(out[2] == imu::kFlagDeviceOverflow, "next packet carries DEVICE_OVERFLOW");
  check(out[6] == 3, "the dropped sample's sequence number (2) is skipped");
}

// Codex P1 on PR #27: a refused first packet must not lose STREAM_START, or the receiver drops the whole stream.
void test_refused_first_packet_keeps_stream_start() {
  imu::RawSample storage[1];
  imu::SampleBatcher b(storage, 1);
  b.begin(9, 0, 0, 0, 1, 0);
  uint8_t out[imu::kMaxPacketBytes];
  b.add(sample(0));
  b.take_packet(out, sizeof out);  // the transport refuses it
  b.mark_overflow();
  b.add(sample(20));
  size_t len = b.take_packet(out, sizeof out);
  check(len == 28 && out[2] == (imu::kFlagStreamStart | imu::kFlagDeviceOverflow),
        "after a refused first packet, the next carries STREAM_START and DEVICE_OVERFLOW");
  check(out[6] == 1, "and continues the sequence (the lost sample's number is skipped)");
  b.add(sample(40));
  len = b.take_packet(out, sizeof out);
  check(len == 28 && out[2] == 0, "once delivered, later packets carry no flags");
  b.take_packet(out, sizeof out);
  b.add(sample(60));
  b.take_packet(out, sizeof out);  // refused, but it did not open the stream
  b.mark_overflow();
  b.add(sample(80));
  len = b.take_packet(out, sizeof out);
  check(out[2] == imu::kFlagDeviceOverflow, "a refused later packet flags overflow only");
}

void test_batcher_restart_discards_stale_samples() {
  imu::RawSample storage[4];
  imu::SampleBatcher b(storage, 4);
  b.begin(1, 0, 0, 0, 4, 100);
  b.add(sample(0));
  b.add(sample(20));
  b.end();
  uint8_t out[imu::kMaxPacketBytes];
  check(b.take_packet(out, sizeof out) == 0, "end() discards buffered samples");
  check(!b.add(sample(40)), "an inactive batcher takes nothing");
  b.begin(2, 0, 0, 0, 4, 100);
  b.add(sample(60));
  const size_t len = b.take_packet(out, sizeof out);
  check(len == 28 && out[2] == imu::kFlagStreamStart && out[4] == 2 && out[6] == 0,
        "a new stream starts at sequence 0 with STREAM_START and its own id");
  check(!b.begin(1, 0, 0, 0, 5, 100), "max_samples above the storage capacity is refused");
}

}  // namespace

int main() {
  test_crc();
  test_golden_sample_packets();
  test_golden_device_info();
  test_uuids_match_app();
  test_encoder_rejects_bad_input();
  test_mtu_table();
  test_batcher_stream_start_and_sequence();
  test_batcher_time_flush();
  test_batcher_overflow_marks_gap();
  test_refused_first_packet_keeps_stream_start();
  test_batcher_restart_discards_stale_samples();
  std::printf("firmware host tests: %d/%d checks passed (%zu golden sample packets, %zu golden device-info packets)\n",
              checks - failures, checks, sizeof kGoldenSamples / sizeof kGoldenSamples[0],
              sizeof kGoldenInfo / sizeof kGoldenInfo[0]);
  return failures == 0 ? 0 : 1;
}
