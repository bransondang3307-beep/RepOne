// IMU stream protocol v1 — portable firmware side (ADR 0008, docs/protocols/imu-stream-v1.md). Status: proposed.
// Plain C++11 with no Arduino or radio dependency, so it builds for the Uno R3 (AVR), a future BLE board, and the
// host tests (firmware/test/host), which hold it to the same golden packets as the app's TypeScript codec.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace imu {

constexpr uint8_t kProtocolVersion = 1;
constexpr uint8_t kTypeSamples = 0x01;
constexpr uint8_t kTypeDeviceInfo = 0x02;
constexpr uint8_t kFlagStreamStart = 0x01;
constexpr uint8_t kFlagDeviceOverflow = 0x02;

constexpr size_t kHeaderBytes = 10;
constexpr size_t kSampleBytes = 16;
constexpr size_t kCrcBytes = 2;
constexpr uint8_t kMaxSamples = 31;
constexpr size_t kMaxPacketBytes = kHeaderBytes + kSampleBytes * kMaxSamples + kCrcBytes;  // 508
constexpr size_t kDeviceInfoBytes = 20;
constexpr uint8_t kMaxChannels = 16;
constexpr uint16_t kAttNotificationOverhead = 3;

// Device status byte (device-info packet, and `E <status>` lines over USB).
enum DeviceStatus : uint8_t {
  kStatusOk = 0,
  kStatusImuNotFound = 1,
  kStatusImuReadFailed = 2,
  kStatusMtuTooSmall = 3,
};

// GATT identifiers, brand-neutral (ADR 0006). Must equal BLE_UUIDS in packages/sensor-protocol (host-tested).
constexpr const char* kServiceUuid = "19bc0001-bab5-4ddb-8e9c-8595137ac300";
constexpr const char* kSamplesCharacteristicUuid = "19bc0002-bab5-4ddb-8e9c-8595137ac300";
constexpr const char* kDeviceInfoCharacteristicUuid = "19bc0003-bab5-4ddb-8e9c-8595137ac300";

// One reading: the IMU's raw register counts, no units applied (the app converts at its transport boundary).
struct RawSample {
  uint32_t device_time_ms;  // millis() since boot; wraps at 2^32
  int16_t accel[3];         // ACCEL_XOUT..ZOUT
  int16_t gyro[3];          // GYRO_XOUT..ZOUT
};

struct DeviceInfo {
  uint8_t serial[8];  // unique per board, most significant byte first; all zeros means "not configured"
  uint8_t channel_count;
  uint8_t accel_range;  // AFS_SEL 0-3
  uint8_t gyro_range;   // FS_SEL 0-3
  uint16_t nominal_rate_hz;
  uint8_t firmware_major;
  uint8_t firmware_minor;
  uint8_t status;  // DeviceStatus
};

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no final XOR). "123456789" -> 0x29B1.
uint16_t crc16_ccitt_false(const uint8_t* data, size_t len);

// Largest sample count whose packet fits one notification at this ATT MTU (0 = not even one).
uint8_t max_samples_for_mtu(uint16_t mtu);

// Encoders return the number of bytes written, or 0 if an argument is out of range or `out` is too small.
size_t encode_sample_packet(uint8_t* out, size_t out_capacity, uint8_t flags, uint8_t accel_range, uint8_t gyro_range,
                            uint8_t channel, uint16_t stream_id, uint16_t first_sequence, const RawSample* samples,
                            uint8_t count);
size_t encode_device_info(uint8_t* out, size_t out_capacity, const DeviceInfo& info);

// Lowercase hex, NUL-terminated. Returns the number of characters (excluding NUL), or 0 if `out` is too small.
size_t to_hex(char* out, size_t out_capacity, const uint8_t* data, size_t len);

// Where finished packets go: hex lines over USB now, BLE notifications on a future board.
class PacketSink {
 public:
  virtual ~PacketSink() {}
  // Returns false if the transport could not take the packet (e.g. a full BLE notification queue).
  virtual bool send(const uint8_t* data, size_t len) = 0;
};

// Collects one channel's samples into packets and numbers them. Every sample taken consumes a sequence number,
// including one dropped because the buffer was full, so the receiver can see the gap; a packet never spans a gap.
class SampleBatcher {
 public:
  // `storage` holds up to `capacity` samples (1-31). The caller sizes it: 1 on the Uno R3 (2 KB of RAM), up to
  // max_samples_for_mtu() on a BLE board.
  SampleBatcher(RawSample* storage, uint8_t capacity) : buffer_(storage), capacity_(capacity) {}

  // Start a new stream: sequence 0, STREAM_START on the first packet, nothing carried over from before.
  // `max_samples` 1-capacity (e.g. max_samples_for_mtu); `flush_after_ms` bounds latency (0 = every sample).
  // Returns false (and stays inactive) if an argument is out of range.
  bool begin(uint16_t stream_id, uint8_t channel, uint8_t accel_range, uint8_t gyro_range, uint8_t max_samples,
             uint16_t flush_after_ms);
  // Stop: discard buffered samples (stale data never crosses into a later stream).
  void end();
  bool active() const { return active_; }

  // Buffer a sample. Returns true when a packet is ready to take. If the buffer is already full the sample is
  // dropped (its sequence number skipped, DEVICE_OVERFLOW set on the next packet) and true is returned.
  bool add(const RawSample& sample);
  // True when buffered samples have waited `flush_after_ms` since the first one was taken.
  bool due(uint32_t now_ms) const;
  bool empty() const { return count_ == 0; }
  // Encode the buffered samples into `out` and clear the buffer. Returns the packet length, or 0 if empty.
  size_t take_packet(uint8_t* out, size_t out_capacity);
  // The transport lost a taken packet: flag DEVICE_OVERFLOW on the next one (the sequence gap shows the count).
  void mark_overflow() { overflow_pending_ = true; }
  uint16_t next_sequence() const { return next_sequence_; }
  uint16_t stream_id() const { return stream_id_; }

 private:
  RawSample* buffer_;
  uint8_t capacity_;
  bool active_ = false;
  uint8_t count_ = 0;
  uint8_t max_samples_ = 1;
  uint16_t flush_after_ms_ = 0;
  uint16_t stream_id_ = 0;
  uint8_t channel_ = 0;
  uint8_t accel_range_ = 0;
  uint8_t gyro_range_ = 0;
  uint16_t next_sequence_ = 0;
  uint16_t first_sequence_ = 0;
  uint32_t first_time_ms_ = 0;
  bool start_pending_ = false;
  bool overflow_pending_ = false;      // samples were lost before the first buffered one: flag the next packet
  bool dropped_after_buffer_ = false;  // samples were dropped after the buffered ones: flag the packet after that
};

}  // namespace imu
