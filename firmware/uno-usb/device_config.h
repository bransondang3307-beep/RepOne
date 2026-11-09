// Per-board settings for the Uno R3 bring-up firmware. Edit before flashing.
#pragma once

// The board's unique 8-byte serial, most significant byte first. The app derives the sensor identity from it
// (source_id = imu-<16 hex digits>-ch0, ADR 0008). The Uno R3 has no factory-unique ID, so choose a value and never
// reuse it on another board. All zeros means "not configured": the firmware still streams, but warns, and the
// app's decoder rejects the device-info packet as unconfigured.
#define IMU_DEVICE_SERIAL {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}

// MPU-6050 I2C address: 0x68 with AD0 low (typical GY-521), 0x69 with AD0 high. Verify on the real breakout (RO-018).
#define IMU_I2C_ADDRESS 0x68
