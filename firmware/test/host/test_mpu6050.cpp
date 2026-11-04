// Host tests for firmware/lib/Mpu6050Raw against a scripted fake Wire bus (fake_arduino/Wire.h). They check register
// addresses, values, transaction shape, big-endian decoding and error handling against the MPU-6000/6050 register map
// (RM-MPU-6000A-00). Synthetic register values; no hardware involved.
#include <cstdio>
#include <string>
#include <vector>

#include "Mpu6050Raw.h"

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

bool logEquals(const TwoWire& wire, const std::vector<std::string>& expected) {
  if (wire.log == expected) return true;
  for (const std::string& line : wire.log) std::printf("  got: %s\n", line.c_str());
  return false;
}

void test_who_am_i() {
  TwoWire wire;
  wire.registers[0x75] = 0x68;
  Mpu6050Raw imu(wire);
  check(imu.whoAmI() == 0x68, "WHO_AM_I value returned");
  check(logEquals(wire, {"W 0x68 0x75 restart", "R 0x68 1"}), "WHO_AM_I uses a register write then a repeated-start read");

  TwoWire absent;
  absent.nack_all = true;
  Mpu6050Raw missing(absent);
  check(missing.whoAmI() == -1, "no acknowledge -> -1");

  TwoWire other;
  other.address = 0x69;
  other.registers[0x75] = 0x68;
  Mpu6050Raw at69(other, 0x69);
  check(at69.whoAmI() == 0x68, "AD0-high address 0x69 is used when configured");
}

void test_configure_writes_the_register_map() {
  TwoWire wire;
  Mpu6050Raw imu(wire);
  check(imu.configure(3, 2, 4, 0), "configure succeeds");
  check(logEquals(wire, {"W 0x68 0x6b 0x01 stop", "W 0x68 0x1a 0x04 stop", "W 0x68 0x19 0x00 stop",
                         "W 0x68 0x1b 0x10 stop", "W 0x68 0x1c 0x18 stop"}),
        "PWR_MGMT_1=PLL X gyro (wakes), CONFIG=DLPF, SMPLRT_DIV, GYRO_CONFIG FS_SEL<<3, ACCEL_CONFIG AFS_SEL<<3");
  check(wire.registers[0x1b] == 0x10 && wire.registers[0x1c] == 0x18, "range bits land in bits 4:3");

  TwoWire untouched;
  Mpu6050Raw bad(untouched);
  check(!bad.configure(4, 0, 0, 0) && !bad.configure(0, 4, 0, 0) && !bad.configure(0, 0, 7, 0),
        "out-of-range ranges or DLPF are refused");
  check(untouched.log.empty(), "a refused configure sends nothing");

  TwoWire absent;
  absent.nack_all = true;
  Mpu6050Raw missing(absent);
  check(!missing.configure(0, 0, 4, 0), "a NACK fails configure");
}

void test_read_decodes_signed_big_endian_and_skips_temperature() {
  TwoWire wire;
  const uint8_t block[14] = {0x40, 0x00, 0x80, 0x00, 0x7f, 0xff,  // accel x=16384, y=-32768, z=32767
                             0x12, 0x34,                          // temperature (ignored)
                             0x00, 0x83, 0xff, 0x7d, 0xff, 0xff};  // gyro x=131, y=-131, z=-1
  for (int i = 0; i < 14; i++) wire.registers[0x3b + i] = block[i];
  Mpu6050Raw imu(wire);
  int16_t accel[3];
  int16_t gyro[3];
  check(imu.read(accel, gyro), "read succeeds");
  check(accel[0] == 16384 && accel[1] == -32768 && accel[2] == 32767, "accel decoded as signed big-endian");
  check(gyro[0] == 131 && gyro[1] == -131 && gyro[2] == -1, "gyro decoded as signed big-endian, temperature skipped");
  check(logEquals(wire, {"W 0x68 0x3b restart", "R 0x68 14"}), "one 14-byte burst from ACCEL_XOUT_H with a repeated start");
}

void test_read_reports_failures() {
  int16_t accel[3];
  int16_t gyro[3];
  TwoWire shortRead;
  shortRead.short_read_by = 1;
  Mpu6050Raw a(shortRead);
  check(!a.read(accel, gyro), "a short read fails");

  TwoWire absent;
  absent.nack_all = true;
  Mpu6050Raw b(absent);
  check(!b.read(accel, gyro), "a NACK fails the read");
}

}  // namespace

int main() {
  test_who_am_i();
  test_configure_writes_the_register_map();
  test_read_decodes_signed_big_endian_and_skips_temperature();
  test_read_reports_failures();
  std::printf("mpu6050 driver host tests: %d/%d checks passed\n", checks - failures, checks);
  return failures == 0 ? 0 : 1;
}
