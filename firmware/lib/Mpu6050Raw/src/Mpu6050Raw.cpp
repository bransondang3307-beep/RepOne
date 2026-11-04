#include "Mpu6050Raw.h"

namespace {
const uint8_t kRegSmplrtDiv = 0x19;
const uint8_t kRegConfig = 0x1A;
const uint8_t kRegGyroConfig = 0x1B;   // FS_SEL in bits 4:3
const uint8_t kRegAccelConfig = 0x1C;  // AFS_SEL in bits 4:3
const uint8_t kRegAccelXoutH = 0x3B;
const uint8_t kRegPwrMgmt1 = 0x6B;
const uint8_t kRegWhoAmI = 0x75;
const uint8_t kClockPllXGyro = 0x01;  // also clears SLEEP

int16_t be16(const uint8_t* p) { return static_cast<int16_t>((static_cast<uint16_t>(p[0]) << 8) | p[1]); }
}  // namespace

bool Mpu6050Raw::writeRegister(uint8_t reg, uint8_t value) {
  wire_.beginTransmission(address_);
  wire_.write(reg);
  wire_.write(value);
  return wire_.endTransmission() == 0;
}

bool Mpu6050Raw::readRegisters(uint8_t reg, uint8_t* out, uint8_t len) {
  wire_.beginTransmission(address_);
  wire_.write(reg);
  if (wire_.endTransmission(false) != 0) return false;  // repeated start
  if (wire_.requestFrom(address_, len) != len) return false;
  for (uint8_t i = 0; i < len; i++) {
    const int c = wire_.read();
    if (c < 0) return false;
    out[i] = static_cast<uint8_t>(c);
  }
  return true;
}

int16_t Mpu6050Raw::whoAmI() {
  uint8_t value = 0;
  return readRegisters(kRegWhoAmI, &value, 1) ? value : -1;
}

bool Mpu6050Raw::configure(uint8_t accelRange, uint8_t gyroRange, uint8_t dlpfConfig, uint8_t sampleRateDivider) {
  if (accelRange > 3 || gyroRange > 3 || dlpfConfig > 6) return false;
  return writeRegister(kRegPwrMgmt1, kClockPllXGyro) && writeRegister(kRegConfig, dlpfConfig) &&
         writeRegister(kRegSmplrtDiv, sampleRateDivider) &&
         writeRegister(kRegGyroConfig, static_cast<uint8_t>(gyroRange << 3)) &&
         writeRegister(kRegAccelConfig, static_cast<uint8_t>(accelRange << 3));
}

bool Mpu6050Raw::read(int16_t accel[3], int16_t gyro[3]) {
  uint8_t raw[14];
  if (!readRegisters(kRegAccelXoutH, raw, sizeof raw)) return false;
  for (int k = 0; k < 3; k++) {
    accel[k] = be16(raw + 2 * k);     // 0x3B..0x40
    gyro[k] = be16(raw + 8 + 2 * k);  // 0x43..0x48 (0x41..0x42 is temperature)
  }
  return true;
}
