#include "ImuStreamProtocol.h"

namespace imu {

namespace {

void put_u16(uint8_t* p, uint16_t v) {
  p[0] = static_cast<uint8_t>(v & 0xFF);
  p[1] = static_cast<uint8_t>(v >> 8);
}

void put_u32(uint8_t* p, uint32_t v) {
  for (int i = 0; i < 4; i++) p[i] = static_cast<uint8_t>((v >> (8 * i)) & 0xFF);
}

void put_i16(uint8_t* p, int16_t v) { put_u16(p, static_cast<uint16_t>(v)); }

}  // namespace

uint16_t crc16_ccitt_false(const uint8_t* data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (int bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? static_cast<uint16_t>((crc << 1) ^ 0x1021) : static_cast<uint16_t>(crc << 1);
    }
  }
  return crc;
}

uint8_t max_samples_for_mtu(uint16_t mtu) {
  const long room = static_cast<long>(mtu) - kAttNotificationOverhead - kHeaderBytes - kCrcBytes;
  if (room < static_cast<long>(kSampleBytes)) return 0;
  const long n = room / static_cast<long>(kSampleBytes);
  return n > kMaxSamples ? kMaxSamples : static_cast<uint8_t>(n);
}

size_t encode_sample_packet(uint8_t* out, size_t out_capacity, uint8_t flags, uint8_t accel_range, uint8_t gyro_range,
                            uint8_t channel, uint16_t stream_id, uint16_t first_sequence, const RawSample* samples,
                            uint8_t count) {
  const size_t len = kHeaderBytes + kSampleBytes * count + kCrcBytes;
  if (count < 1 || count > kMaxSamples || accel_range > 3 || gyro_range > 3 || channel >= kMaxChannels ||
      (flags & ~(kFlagStreamStart | kFlagDeviceOverflow)) != 0 || out_capacity < len) {
    return 0;
  }
  out[0] = kProtocolVersion;
  out[1] = kTypeSamples;
  out[2] = flags;
  out[3] = static_cast<uint8_t>(accel_range | (gyro_range << 2) | (channel << 4));
  put_u16(out + 4, stream_id);
  put_u16(out + 6, first_sequence);
  out[8] = count;
  out[9] = 0;
  for (uint8_t i = 0; i < count; i++) {
    uint8_t* p = out + kHeaderBytes + kSampleBytes * i;
    put_u32(p, samples[i].device_time_ms);
    for (int k = 0; k < 3; k++) put_i16(p + 4 + 2 * k, samples[i].accel[k]);
    for (int k = 0; k < 3; k++) put_i16(p + 10 + 2 * k, samples[i].gyro[k]);
  }
  put_u16(out + len - kCrcBytes, crc16_ccitt_false(out, len - kCrcBytes));
  return len;
}

size_t encode_device_info(uint8_t* out, size_t out_capacity, const DeviceInfo& info) {
  if (out_capacity < kDeviceInfoBytes || info.channel_count < 1 || info.channel_count > kMaxChannels ||
      info.accel_range > 3 || info.gyro_range > 3 || info.nominal_rate_hz == 0) {
    return 0;
  }
  out[0] = kProtocolVersion;
  out[1] = kTypeDeviceInfo;
  for (int i = 0; i < 8; i++) out[2 + i] = info.serial[i];
  out[10] = info.channel_count;
  out[11] = static_cast<uint8_t>(info.accel_range | (info.gyro_range << 2));
  put_u16(out + 12, info.nominal_rate_hz);
  out[14] = info.firmware_major;
  out[15] = info.firmware_minor;
  out[16] = info.status;
  out[17] = 0;
  put_u16(out + 18, crc16_ccitt_false(out, kDeviceInfoBytes - kCrcBytes));
  return kDeviceInfoBytes;
}

size_t to_hex(char* out, size_t out_capacity, const uint8_t* data, size_t len) {
  static const char kDigits[] = "0123456789abcdef";
  if (out_capacity < 2 * len + 1) return 0;
  for (size_t i = 0; i < len; i++) {
    out[2 * i] = kDigits[data[i] >> 4];
    out[2 * i + 1] = kDigits[data[i] & 0x0F];
  }
  out[2 * len] = '\0';
  return 2 * len;
}

bool SampleBatcher::begin(uint16_t stream_id, uint8_t channel, uint8_t accel_range, uint8_t gyro_range,
                          uint8_t max_samples, uint16_t flush_after_ms) {
  active_ = false;
  count_ = 0;
  if (channel >= kMaxChannels || accel_range > 3 || gyro_range > 3 || max_samples < 1 || max_samples > kMaxSamples ||
      max_samples > capacity_ || buffer_ == nullptr) {
    return false;
  }
  stream_id_ = stream_id;
  channel_ = channel;
  accel_range_ = accel_range;
  gyro_range_ = gyro_range;
  max_samples_ = max_samples;
  flush_after_ms_ = flush_after_ms;
  next_sequence_ = 0;
  first_sequence_ = 0;
  start_pending_ = true;
  overflow_pending_ = false;
  dropped_after_buffer_ = false;
  active_ = true;
  return true;
}

void SampleBatcher::end() {
  active_ = false;
  count_ = 0;
}

bool SampleBatcher::add(const RawSample& sample) {
  if (!active_) return false;
  if (count_ >= max_samples_) {
    next_sequence_++;  // the dropped sample's number: the receiver sees the gap
    dropped_after_buffer_ = true;  // the gap follows the buffered samples, so it belongs to the next packet
    return true;
  }
  if (count_ == 0) {
    first_sequence_ = next_sequence_;
    first_time_ms_ = sample.device_time_ms;
  }
  buffer_[count_++] = sample;
  next_sequence_++;
  return count_ >= max_samples_;
}

bool SampleBatcher::due(uint32_t now_ms) const {
  return active_ && count_ > 0 && static_cast<uint32_t>(now_ms - first_time_ms_) >= flush_after_ms_;
}

size_t SampleBatcher::take_packet(uint8_t* out, size_t out_capacity) {
  if (!active_ || count_ == 0) return 0;
  const uint8_t flags = (start_pending_ ? kFlagStreamStart : 0) | (overflow_pending_ ? kFlagDeviceOverflow : 0);
  const size_t len = encode_sample_packet(out, out_capacity, flags, accel_range_, gyro_range_, channel_, stream_id_,
                                          first_sequence_, buffer_, count_);
  if (len == 0) return 0;
  count_ = 0;
  start_pending_ = false;
  overflow_pending_ = dropped_after_buffer_;
  dropped_after_buffer_ = false;
  return len;
}

}  // namespace imu
