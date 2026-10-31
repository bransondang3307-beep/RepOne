// Host-test stand-in for the Arduino Wire (I2C) API: a scripted fake device with a register file that records every
// transaction, so tests can check what the driver sends and how it handles NACKs and short reads. Not an I2C emulator.
#pragma once
#include <stdint.h>

#include <string>
#include <vector>

class TwoWire {
 public:
  // --- what the fake device does ---
  uint8_t address = 0x68;          // the only address that acknowledges
  uint8_t registers[256] = {};     // register file; reads auto-increment like the MPU-6050
  bool nack_all = false;           // nothing acknowledges
  int short_read_by = 0;           // requestFrom() returns this many bytes fewer than asked
  std::vector<std::string> log;    // "W <addr> <bytes...> stop|restart", "R <addr> <count>"

  void beginTransmission(uint8_t addr) {
    tx_addr_ = addr;
    tx_.clear();
  }
  size_t write(uint8_t b) {
    tx_.push_back(b);
    return 1;
  }
  uint8_t endTransmission(bool stop = true) {
    std::string entry = "W " + hex(tx_addr_);
    for (uint8_t b : tx_) entry += " " + hex(b);
    log.push_back(entry + (stop ? " stop" : " restart"));
    if (nack_all || tx_addr_ != address) return 2;  // address NACK
    if (!tx_.empty()) {
      pointer_ = tx_[0];
      for (size_t i = 1; i < tx_.size(); i++) registers[static_cast<uint8_t>(tx_[0] + i - 1)] = tx_[i];
    }
    return 0;
  }
  uint8_t requestFrom(uint8_t addr, uint8_t quantity) {
    log.push_back("R " + hex(addr) + " " + std::to_string(quantity));
    rx_.clear();
    if (nack_all || addr != address) return 0;
    int n = quantity - short_read_by;
    for (int i = 0; i < n; i++) rx_.push_back(registers[pointer_++]);
    rx_pos_ = 0;
    return static_cast<uint8_t>(n);
  }
  int read() { return rx_pos_ < rx_.size() ? rx_[rx_pos_++] : -1; }

 private:
  static std::string hex(uint8_t b) {
    static const char d[] = "0123456789abcdef";
    return std::string("0x") + d[b >> 4] + d[b & 15];
  }
  uint8_t tx_addr_ = 0;
  std::vector<uint8_t> tx_;
  uint8_t pointer_ = 0;
  std::vector<uint8_t> rx_;
  size_t rx_pos_ = 0;
};
