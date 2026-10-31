// Bluetooth LE sensor adapter (RO-029, ADR 0008): a real IMU sensor as a DeviceConnection. Imported by the composition
// root only (application/), through this index.
export type { BleCentral, BlePeripheralSeen, BleRadioState } from './BleCentral';
export { BleSensorDevice, RADIO_MESSAGES, type BleSensorDeviceOptions, type BleSensorInfo } from './BleSensorDevice';
export { BleSensorScanner, type ScanOptions, type ScanResult } from './BleSensorScanner';
export { createNativeBleCentral, isNativeBleAvailable } from './createNativeBleCentral';
