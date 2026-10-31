// Public API of @repone/sensor-protocol — the IMU stream wire protocol v1 (ADR 0008).
// Transport-independent: no React, React Native, Expo or Bluetooth imports. Depends only on @repone/sensor-contracts.

export {
  ATT_NOTIFICATION_OVERHEAD_BYTES,
  BLE_UUIDS,
  CRC_BYTES,
  DEVICE_INFO_BYTES,
  DeviceStatus,
  MAX_CHANNELS,
  MAX_SAMPLES_PER_PACKET,
  MAX_SAMPLE_PACKET_BYTES,
  MIN_MTU_FOR_ONE_SAMPLE,
  PROTOCOL_VERSION,
  PacketType,
  SAMPLE_BYTES,
  SAMPLE_HEADER_BYTES,
  SampleFlag,
  maxSamplesForMtu,
} from './constants';
export { crc16CcittFalse } from './crc16';
export {
  ACCEL_LSB_PER_G,
  ACCEL_RANGE_G,
  GYRO_LSB_PER_DPS,
  GYRO_RANGE_DPS,
  STANDARD_GRAVITY_M_S2,
  accelRawToMS2,
  accelVecToMS2,
  gyroRawToRadS,
  gyroVecToRadS,
  isFullScaleCode,
  isSaturated,
  type FullScaleCode,
} from './units';
export {
  decodePacket,
  encodeDeviceInfo,
  encodeSamplePacket,
  samplePacketBytes,
  type DecodeError,
  type DecodeErrorCode,
  type DecodeResult,
  type DeviceInfoPacket,
  type Packet,
  type SamplePacket,
  type WireImuSample,
} from './packets';
export { StreamTracker, type StreamEvent, type StreamTrackerOptions, type TrackResult } from './StreamTracker';
export { bytesToHex, hexToBytes, parseSerialLine, type SerialLine } from './serialLines';
