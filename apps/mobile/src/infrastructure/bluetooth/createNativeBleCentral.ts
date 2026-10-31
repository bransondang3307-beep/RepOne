import { NativeModules, PermissionsAndroid, Platform, TurboModuleRegistry } from 'react-native';
import type { Unsubscribe } from '@repone/sensor-contracts';
import type { BleCentral, BleCharacteristicInfo, BleRadioState } from './BleCentral';

/**
 * True when this app binary contains the BLE native module: a development or release build made with the
 * react-native-ble-manager config plugin. Expo Go does not contain it, so real sensors are unavailable there and the
 * app offers simulation only.
 */
export function isNativeBleAvailable(): boolean {
  return TurboModuleRegistry.get('BleManager') != null || NativeModules.BleManager != null;
}

// Loaded only when the native module exists: importing it in Expo Go throws at load time.
type BleManagerModule = typeof import('react-native-ble-manager');

const lower = (uuid: string) => uuid.toLowerCase();

const RADIO_STATES: Record<string, BleRadioState> = {
  on: 'on',
  off: 'off',
  turning_on: 'off',
  turning_off: 'off',
  unauthorized: 'unauthorized',
  unsupported: 'unsupported',
  resetting: 'resetting',
  unknown: 'unknown',
};
const toRadioState = (state: string): BleRadioState => RADIO_STATES[state] ?? 'unknown';

/** How long prepare() waits for a definite radio state, e.g. while iOS shows its Bluetooth permission prompt. */
const SETTLE_MS = 5000;
const unsettled = (state: BleRadioState) => state === 'unknown' || state === 'resetting';

/** Android 12+ asks for scan/connect at run time; older versions need location for BLE scans. iOS asks by itself. */
async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted =
    Number(Platform.Version) >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
  const granted = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => granted[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/**
 * The real BleCentral over react-native-ble-manager 12.6.1 (a TurboModule). Returns null in Expo Go. Only this file
 * talks to the native module; everything above it is tested against a fake central.
 */
export function createNativeBleCentral(): BleCentral | null {
  if (!isNativeBleAvailable()) return null;
  const { default: manager } = require('react-native-ble-manager') as BleManagerModule;
  let started: Promise<void> | null = null;
  const start = () => (started ??= manager.start({ showAlert: false }));

  let scanSubscription: { remove(): void } | null = null;
  const notificationTargets = new Map<string, (value: Uint8Array) => void>();
  const key = (peripheralId: string, service: string, characteristic: string) =>
    `${peripheralId}|${lower(service)}|${lower(characteristic)}`;
  // One native listener for every characteristic value; it hands each value to the matching subscriber, in order.
  let valueSubscription: { remove(): void } | null = null;
  const ensureValueListener = () => {
    valueSubscription ??= manager.onDidUpdateValueForCharacteristic((event) => {
      notificationTargets.get(key(event.peripheral, event.service, event.characteristic))?.(Uint8Array.from(event.value));
    });
  };

  return {
    async prepare() {
      if (!(await requestAndroidPermissions())) return 'unauthorized';
      await start();
      const first = toRadioState(await manager.checkState());
      if (!unsettled(first)) return first;
      // iOS reports `unknown` until the user answers the permission prompt that start() raised: wait for the answer.
      return new Promise<BleRadioState>((resolve) => {
        const timer = setTimeout(() => {
          sub.remove();
          resolve(first);
        }, SETTLE_MS);
        const sub = manager.onDidUpdateState((event) => {
          const state = toRadioState(event.state);
          if (unsettled(state)) return;
          clearTimeout(timer);
          sub.remove();
          resolve(state);
        });
      });
    },

    subscribeRadioState(listener): Unsubscribe {
      const sub = manager.onDidUpdateState((event) => listener(toRadioState(event.state)));
      return () => sub.remove();
    },

    async startScan(serviceUuids, onSeen) {
      await start();
      const sub = manager.onDiscoverPeripheral((p) => onSeen({ id: p.id, name: p.name ?? p.advertising?.localName ?? null, rssi: p.rssi }));
      scanSubscription?.remove();
      scanSubscription = sub;
      await manager.scan({ serviceUUIDs: [...serviceUuids], seconds: 0, allowDuplicates: false });
    },

    async stopScan() {
      scanSubscription?.remove();
      scanSubscription = null;
      await manager.stopScan();
    },

    async connect(peripheralId) {
      await start();
      await manager.connect(peripheralId);
      // iOS negotiates the ATT MTU itself; Android needs to be asked (spec §9).
      if (Platform.OS === 'android') await manager.requestMTU(peripheralId, 247).catch(() => undefined);
    },

    async disconnect(peripheralId) {
      for (const k of [...notificationTargets.keys()]) if (k.startsWith(`${peripheralId}|`)) notificationTargets.delete(k);
      await manager.disconnect(peripheralId);
    },

    subscribeDisconnect(listener): Unsubscribe {
      const sub = manager.onDisconnectPeripheral((event) => {
        for (const k of [...notificationTargets.keys()]) if (k.startsWith(`${event.peripheral}|`)) notificationTargets.delete(k);
        listener(event.peripheral);
      });
      return () => sub.remove();
    },

    async discover(peripheralId) {
      const info = await manager.retrieveServices(peripheralId);
      return (info.characteristics ?? []).map(
        (c): BleCharacteristicInfo => ({
          service: lower(c.service),
          characteristic: lower(c.characteristic),
          properties: [
            ...(c.properties.Read ? (['read'] as const) : []),
            ...(c.properties.Write ? (['write'] as const) : []),
            ...(c.properties.Notify ? (['notify'] as const) : []),
            ...(c.properties.Indicate ? (['indicate'] as const) : []),
          ],
        }),
      );
    },

    async read(peripheralId, service, characteristic) {
      return Uint8Array.from(await manager.read(peripheralId, service, characteristic));
    },

    async startNotifications(peripheralId, service, characteristic, onValue) {
      ensureValueListener();
      notificationTargets.set(key(peripheralId, service, characteristic), onValue);
      try {
        await manager.startNotification(peripheralId, service, characteristic);
      } catch (error) {
        notificationTargets.delete(key(peripheralId, service, characteristic));
        throw error;
      }
    },

    async stopNotifications(peripheralId, service, characteristic) {
      notificationTargets.delete(key(peripheralId, service, characteristic));
      await manager.stopNotification(peripheralId, service, characteristic);
    },
  };
}
