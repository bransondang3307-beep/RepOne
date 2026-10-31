// Minimal MPU-6050 access over the Arduino Wire API. Registers: MPU-6000/6050 register map RM-MPU-6000A-00.
// Reads raw counts only: no unit conversion, filtering beyond the chip's own DLPF, or bias removal.
// Not physically verified: no GY-521 / MPU-6050 has run this code yet (RO-018).
#pragma once

#include <Arduino.h>
#include <Wire.h>

class Mpu6050Raw {
 public:
  static const uint8_t kDefaultAddress = 0x68;  // AD0 low; 0x69 with AD0 high
  static const uint8_t kWhoAmIExpected = 0x68;  // MPU-6050 (other parts answer differently and are not accepted)

  explicit Mpu6050Raw(TwoWire& wire, uint8_t address = kDefaultAddress) : wire_(wire), address_(address) {}

  // Reads WHO_AM_I. Returns the value (0-255), or -1 if the device did not acknowledge.
  int16_t whoAmI();

  // Wakes the chip, selects the X-gyro PLL clock, and sets the digital low-pass filter (DLPF_CFG 0-6),
  // the sample-rate divider and the full-scale ranges (codes 0-3). Returns false on any I2C error.
  bool configure(uint8_t accelRange, uint8_t gyroRange, uint8_t dlpfConfig, uint8_t sampleRateDivider);

  // Burst-reads ACCEL_XOUT_H..GYRO_ZOUT_L (14 bytes; temperature skipped). Returns false on any I2C error.
  bool read(int16_t accel[3], int16_t gyro[3]);

 private:
  bool writeRegister(uint8_t reg, uint8_t value);
  bool readRegisters(uint8_t reg, uint8_t* out, uint8_t len);

  TwoWire& wire_;
  uint8_t address_;
};
