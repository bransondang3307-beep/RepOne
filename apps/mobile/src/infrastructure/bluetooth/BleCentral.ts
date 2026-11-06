import type { Unsubscribe } from '@repone/sensor-contracts';

/** The phone's Bluetooth radio as the OS reports it. */
export type BleRadioState = 'on' | 'off' | 'unauthorized' | 'unsupported' | 'resetting' | 'unknown';

export interface BlePeripheralSeen {
  /** The OS's handle for this peripheral. On iOS it is a per-phone UUID: never a sensor identity (ADR 0008 §3). */
  readonly id: string;
  /** Advertised name, if any. Shown to people only; never matched on. */
  readonly name: string | null;
  readonly rssi: number;
}

export interface BleCharacteristicInfo {
  /** Lowercase 128-bit UUIDs. */
  readonly service: string;
  readonly characteristic: string;
  readonly properties: readonly ('read' | 'write' | 'notify' | 'indicate')[];
}

/**
 * The native boundary: the few BLE central operations the sensor adapter needs. `createNativeBleCentral` implements
 * it over react-native-ble-manager in a development build; tests use a fake. Implementations report UUIDs in
 * lowercase and characteristic values as bytes, and deliver each callback on the JS thread in arrival order.
 */
export interface BleCentral {
  /** Ask for permission if needed and report the radio state. Never throws for "off" or "denied": it reports them. */
  prepare(): Promise<BleRadioState>;
  subscribeRadioState(listener: (state: BleRadioState) => void): Unsubscribe;

  /** Scan for peripherals advertising one of these services. Each peripheral is reported once per scan. */
  startScan(serviceUuids: readonly string[], onSeen: (peripheral: BlePeripheralSeen) => void): Promise<void>;
  stopScan(): Promise<void>;

  /** Resolves once connected. May never settle on its own (iOS connects have no timeout): callers bound it. */
  connect(peripheralId: string): Promise<void>;
  /** Also cancels a connect still in progress. */
  disconnect(peripheralId: string): Promise<void>;
  /** The link to a peripheral dropped, or a disconnect() completed. */
  subscribeDisconnect(listener: (peripheralId: string) => void): Unsubscribe;

  discover(peripheralId: string): Promise<readonly BleCharacteristicInfo[]>;
  read(peripheralId: string, service: string, characteristic: string): Promise<Uint8Array>;
  /** Enable notifications; each value is passed to `onValue` in arrival order until stopNotifications(). */
  startNotifications(
    peripheralId: string,
    service: string,
    characteristic: string,
    onValue: (value: Uint8Array) => void,
  ): Promise<void>;
  stopNotifications(peripheralId: string, service: string, characteristic: string): Promise<void>;
}
