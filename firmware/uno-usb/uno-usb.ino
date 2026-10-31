// Uno R3 USB bring-up firmware for the IMU stream protocol v1 (ADR 0008, proposed). The Uno R3 has no Bluetooth:
// this streams over USB serial only, as hex lines a PC can capture and the app's codec can decode
// (docs/protocols/imu-stream-v1.md §12):
//   I <hex>   device info       S <hex>   one sample packet       # ...   human-readable diagnostic, never data
//   E <status> <text>   device error (1 = IMU not found, 2 = IMU read failed)
// 115200 baud, 8N1. Opening the serial port resets the Uno, so a capture starts at boot with a fresh stream.
// Compiled only; not yet run on a physical Uno R3 + MPU-6050 (RO-018).

#include <Wire.h>

#include <ImuStreamProtocol.h>
#include <Mpu6050Raw.h>

#include "device_config.h"

namespace {

const uint8_t kFirmwareMajor = 0;
const uint8_t kFirmwareMinor = 1;
const uint16_t kRateHz = 50;         // proposed default (ADR 0008 §7)
const uint32_t kPeriodMs = 1000 / kRateHz;
const uint8_t kAccelRange = 0;       // ±2 g
const uint8_t kGyroRange = 0;        // ±250 °/s
const uint8_t kDlpfConfig = 4;       // ~21 Hz accel / ~20 Hz gyro bandwidth, below the 25 Hz Nyquist limit at 50 Hz
const uint8_t kSampleRateDivider = 0;  // 1 kHz internal rate; we poll the latest filtered value at kRateHz
const uint32_t kRetryMs = 2000;
const uint32_t kInfoEveryMs = 10000;
const uint32_t kReadoutEveryMs = 1000;

Mpu6050Raw imuChip(Wire, IMU_I2C_ADDRESS);
imu::RawSample batchStorage[1];  // one sample per line over USB: lowest latency, smallest RAM use
imu::SampleBatcher batcher(batchStorage, 1);
imu::DeviceInfo info = {IMU_DEVICE_SERIAL, 1, kAccelRange, kGyroRange, kRateHz, kFirmwareMajor, kFirmwareMinor,
                        imu::kStatusOk};

uint8_t packet[imu::kHeaderBytes + imu::kSampleBytes + imu::kCrcBytes];
char hexLine[2 * sizeof packet + 1];
uint32_t nextSampleMs = 0;
uint32_t nextRetryMs = 0;
uint32_t nextInfoMs = 0;
uint32_t nextReadoutMs = 0;
uint32_t lateSamples = 0;

void printHexLine(char prefix, const uint8_t* data, size_t len) {
  if (imu::to_hex(hexLine, sizeof hexLine, data, len) == 0) return;
  Serial.print(prefix);
  Serial.print(' ');
  Serial.println(hexLine);
}

void sendInfo() {
  uint8_t bytes[imu::kDeviceInfoBytes];
  const size_t len = imu::encode_device_info(bytes, sizeof bytes, info);
  if (len > 0) printHexLine('I', bytes, len);
}

void setStatus(uint8_t status, const __FlashStringHelper* message) {
  if (status != imu::kStatusOk) {
    Serial.print(F("E "));
    Serial.print(status);
    Serial.print(' ');
    Serial.println(message);
  }
  if (info.status != status) {
    info.status = status;
    sendInfo();
  }
}

bool serialConfigured() {
  for (uint8_t i = 0; i < 8; i++) {
    if (info.serial[i] != 0) return true;
  }
  return false;
}

// Probe and configure the IMU, then start a new stream. Returns false (and reports why) if the IMU is not usable.
bool startImu() {
  const int16_t who = imuChip.whoAmI();
  if (who < 0) {
    setStatus(imu::kStatusImuNotFound, F("imu did not acknowledge on I2C"));
    return false;
  }
  if (who != Mpu6050Raw::kWhoAmIExpected) {
    Serial.print(F("# WHO_AM_I=0x"));
    Serial.print(who, HEX);
    Serial.println(F(", expected 0x68 (MPU-6050); not accepted"));
    setStatus(imu::kStatusImuNotFound, F("unexpected WHO_AM_I"));
    return false;
  }
  if (!imuChip.configure(kAccelRange, kGyroRange, kDlpfConfig, kSampleRateDivider)) {
    setStatus(imu::kStatusImuNotFound, F("imu configuration write failed"));
    return false;
  }
  const uint16_t streamId = static_cast<uint16_t>(random(0x10000L));
  batcher.begin(streamId, 0, kAccelRange, kGyroRange, 1, 0);
  Serial.print(F("# imu ok (WHO_AM_I=0x68); stream 0x"));
  Serial.print(streamId, HEX);
  Serial.print(F(" at "));
  Serial.print(kRateHz);
  Serial.println(F(" Hz, +-2 g, +-250 dps"));
  setStatus(imu::kStatusOk, F(""));
  nextSampleMs = millis();
  return true;
}

void printReadout(const imu::RawSample& s) {
  // Diagnostic only (a '#' line is never data): nominal sensitivities, as in the app's codec.
  Serial.print(F("# t="));
  Serial.print(s.device_time_ms);
  Serial.print(F(" seq="));
  Serial.print(static_cast<uint16_t>(batcher.next_sequence() - 1));
  Serial.print(F(" accel_m_s2="));
  for (int k = 0; k < 3; k++) {
    Serial.print(s.accel[k] / 16384.0 * 9.80665, 2);
    Serial.print(k < 2 ? ',' : ' ');
  }
  Serial.print(F("gyro_dps="));
  for (int k = 0; k < 3; k++) {
    Serial.print(s.gyro[k] / 131.0, 2);
    if (k < 2) Serial.print(',');
  }
  if (lateSamples > 0) {
    Serial.print(F(" late="));
    Serial.print(lateSamples);
  }
  Serial.println();
}

}  // namespace

void setup() {
  Serial.begin(115200);
  Wire.begin();  // 100 kHz default; the breakout's pull-ups are not assumed fast enough for 400 kHz
#if defined(WIRE_HAS_TIMEOUT)
  Wire.setWireTimeout(3000 /* us */, true);  // a stuck bus reports an error instead of hanging
#endif
  randomSeed(analogRead(A0) ^ micros());  // stream ids only; A0 needs no wiring
  Serial.print(F("# imu stream firmware "));
  Serial.print(kFirmwareMajor);
  Serial.print('.');
  Serial.print(kFirmwareMinor);
  Serial.println(F(" (uno-usb), protocol v1"));
  if (!serialConfigured()) {
    Serial.println(F("# WARNING: IMU_DEVICE_SERIAL is not set in device_config.h; the app will reject this device"));
  }
  sendInfo();
  if (!startImu()) nextRetryMs = millis() + kRetryMs;
  nextInfoMs = millis() + kInfoEveryMs;
}

void loop() {
  const uint32_t now = millis();

  if (static_cast<int32_t>(now - nextInfoMs) >= 0) {
    sendInfo();  // so a capture that missed boot still learns the device's identity
    nextInfoMs = now + kInfoEveryMs;
  }

  if (!batcher.active()) {
    if (static_cast<int32_t>(now - nextRetryMs) >= 0 && !startImu()) nextRetryMs = now + kRetryMs;
    return;
  }

  if (static_cast<int32_t>(now - nextSampleMs) < 0) return;
  if (now - nextSampleMs >= kPeriodMs) {
    lateSamples++;  // fell behind (e.g. serial back-pressure): resynchronise rather than burst
    nextSampleMs = now;
  }
  nextSampleMs += kPeriodMs;

  imu::RawSample sample;
  sample.device_time_ms = now;
  if (!imuChip.read(sample.accel, sample.gyro)) {
    batcher.end();  // the stream ends; a recovered IMU starts a new one
    setStatus(imu::kStatusImuReadFailed, F("imu read failed while streaming"));
    nextRetryMs = now + kRetryMs;
    return;
  }
  batcher.add(sample);
  const size_t len = batcher.take_packet(packet, sizeof packet);
  if (len > 0) printHexLine('S', packet, len);

  if (static_cast<int32_t>(now - nextReadoutMs) >= 0) {
    printReadout(sample);
    nextReadoutMs = now + kReadoutEveryMs;
  }
}
