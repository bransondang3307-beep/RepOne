import type { ConnectionError, ConnectionState, DeviceTransport, Unsubscribe } from '@repone/sensor-contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppContainer, BleSupport, SensorKind } from '../../application';

/** A sensor found by a scan. `name` is for people only; identity comes from the sensor once connected. */
export interface DiscoveredSensor {
  readonly peripheralId: string;
  readonly name: string;
  readonly rssi: number;
}

export interface DeviceConnectionState {
  readonly deviceId: string;
  readonly transport: DeviceTransport;
  readonly connectionState: ConnectionState;
  /** Why the connection failed; null unless `connectionState` is `failed`. */
  readonly error: ConnectionError | null;
  /** True only while the simulated device is chosen: the test control is offered. */
  readonly canSimulateConnectionLoss: boolean;
  /** Simulated or real (BLE): always the user's explicit choice. */
  readonly sensorKind: SensorKind;
  /** `needs_development_build` in Expo Go: real sensors cannot be used there. */
  readonly bleSupport: BleSupport;
  readonly scanning: boolean;
  /** Why the last scan could not run (Bluetooth off, permission denied …); null otherwise. */
  readonly scanMessage: string | null;
  readonly discovered: readonly DiscoveredSensor[];
  readonly selectedPeripheralId: string | null;
  /** The connected real sensor's own report (identity, firmware, rate); null otherwise. */
  readonly sensorSummary: string | null;
  /** Never throws: a failed attempt shows up as `connectionState: 'failed'` with its `error`. */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Test control (simulated device only): drop the connection now. A no-op otherwise. */
  simulateConnectionLoss(): void;
  chooseSimulated(): Promise<void>;
  chooseBle(): Promise<void>;
  scan(): Promise<void>;
  stopScan(): Promise<void>;
  selectSensor(peripheralId: string): Promise<void>;
}

export type DeviceConnectionStore = StoreApi<DeviceConnectionState>;

/** Thin UI-state adapter over the container's sensor selection and its current DeviceConnection (ADR 0007 §4). */
export function createDeviceConnectionStore(
  container: Pick<AppContainer, 'sensors' | 'simulateConnectionLoss'>,
): DeviceConnectionStore {
  const { sensors } = container;

  const deviceFields = () => {
    const device = sensors.device;
    const info = sensors.bleSensorInfo();
    return {
      deviceId: device.deviceId,
      transport: device.transport,
      connectionState: device.getState(),
      error: device.getLastError(),
      canSimulateConnectionLoss: device.transport === 'simulated',
      sensorKind: sensors.kind,
      selectedPeripheralId: sensors.selectedPeripheralId,
      sensorSummary: info
        ? `Sensor ${info.deviceSerial} · firmware ${info.firmwareVersion} · ${info.nominalRateHz} Hz · ${info.channelCount} IMU`
        : null,
    };
  };

  const store = createStore<DeviceConnectionState>()((set, get) => ({
    ...deviceFields(),
    bleSupport: sensors.bleSupport,
    scanning: false,
    scanMessage: null,
    discovered: [],

    async connect() {
      // The rejection carries the same reason the device publishes with `failed`, which the state mirrors.
      await sensors.device.connect().catch(() => undefined);
    },

    async disconnect() {
      await sensors.device.disconnect();
    },

    simulateConnectionLoss() {
      container.simulateConnectionLoss();
    },

    async chooseSimulated() {
      await sensors.useSimulated();
      set({ scanning: false, discovered: [], scanMessage: null });
    },

    async chooseBle() {
      await sensors.chooseBle();
    },

    async scan() {
      if (get().scanning) return;
      set({ scanning: true, discovered: [], scanMessage: null });
      const result = await sensors
        .scanForSensors(
          (found) =>
            set({ discovered: [...get().discovered, { peripheralId: found.id, name: found.name ?? 'IMU sensor', rssi: found.rssi }] }),
          () => set({ scanning: false }),
        )
        .catch((error: unknown) => ({ radio: 'unknown' as const, message: error instanceof Error ? error.message : String(error) }));
      if (result.message) set({ scanning: false, scanMessage: result.message });
    },

    async stopScan() {
      await sensors.stopScan();
      set({ scanning: false });
    },

    async selectSensor(peripheralId) {
      await sensors.useBleSensor(peripheralId);
    },
  }));

  // Follow the current device's state, and re-subscribe whenever the selection replaces the device.
  let unsubscribeDevice: Unsubscribe = () => undefined;
  const follow = () => {
    unsubscribeDevice();
    unsubscribeDevice = sensors.device.subscribeState(() => store.setState(deviceFields()));
    store.setState(deviceFields());
  };
  sensors.subscribe(follow);
  follow();
  return store;
}
