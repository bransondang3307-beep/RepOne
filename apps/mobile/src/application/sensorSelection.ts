import {
  DeviceConnectError,
  type ConnectionError,
  type ConnectionState,
  type DeviceChannel,
  type DeviceConnection,
  type Scheduler,
  type Unsubscribe,
} from '@repone/sensor-contracts';
import {
  BleSensorDevice,
  BleSensorScanner,
  type BleCentral,
  type BlePeripheralSeen,
  type BleSensorInfo,
  type ScanResult,
} from '../infrastructure/bluetooth';

export type { ScanResult };

export type SensorKind = 'simulated' | 'ble';
/** Real BLE sensors need a development build: Expo Go does not contain the BLE native module. */
export type BleSupport = 'available' | 'needs_development_build';

/**
 * Which sensor the app records from: the simulated device, or a real BLE sensor the user scanned for and picked
 * (RO-029). The choice is always explicit. A failed real connection is reported; the app never falls back to
 * simulation, and choosing Bluetooth without a sensor gives a device that refuses to connect until one is picked.
 */
export interface SensorSelection {
  readonly bleSupport: BleSupport;
  readonly kind: SensorKind;
  /** The device sessions record from now. Changes only through useSimulated()/useBleSensor()/chooseBle(). */
  readonly device: DeviceConnection;
  /** The picked BLE peripheral; null for the simulated device or when none is picked yet. */
  readonly selectedPeripheralId: string | null;
  /** Called after the device or kind changed. */
  subscribe(listener: () => void): Unsubscribe;
  useSimulated(): Promise<void>;
  /** Switch to Bluetooth before a sensor is picked (the device refuses to connect until one is). */
  chooseBle(): Promise<void>;
  useBleSensor(peripheralId: string): Promise<void>;
  /** Scan for 10 s; `onStopped` runs when the scan ends, by itself or through stopScan(). */
  scanForSensors(onFound: (sensor: BlePeripheralSeen) => void, onStopped?: () => void): Promise<ScanResult>;
  stopScan(): Promise<void>;
  /** What the connected BLE sensor reported about itself; null otherwise. */
  bleSensorInfo(): BleSensorInfo | null;
}

export interface SensorSelectionOptions {
  readonly simulated: DeviceConnection;
  /** The native BLE central, or null where BLE is unavailable (Expo Go, tests without BLE). */
  readonly central: BleCentral | null;
  readonly scheduler?: Scheduler;
}

/** Stands in while Bluetooth is chosen but no sensor is picked: connect() fails with an actionable reason. */
class NoSensorPicked implements DeviceConnection {
  readonly deviceId = 'ble-none-picked';
  readonly transport = 'ble' as const;
  private state: ConnectionState = 'disconnected';
  private lastError: ConnectionError | null = null;
  private readonly listeners = new Set<(state: ConnectionState) => void>();

  constructor(private readonly reason: string) {}

  getState(): ConnectionState {
    return this.state;
  }
  getLastError(): ConnectionError | null {
    return this.lastError;
  }
  subscribeState(listener: (state: ConnectionState) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  getChannels(): readonly DeviceChannel[] {
    return [];
  }
  async connect(): Promise<void> {
    const error: ConnectionError = { code: 'unavailable', message: this.reason };
    this.lastError = error;
    if (this.state !== 'failed') {
      this.state = 'failed';
      for (const listener of this.listeners) listener('failed');
    }
    throw new DeviceConnectError(error);
  }
  async disconnect(): Promise<void> {}
}

export function createSensorSelection(options: SensorSelectionOptions): SensorSelection {
  const { simulated, central } = options;
  const scanner = central ? new BleSensorScanner(central, options.scheduler) : null;
  const listeners = new Set<() => void>();
  let kind: SensorKind = 'simulated';
  let device: DeviceConnection = simulated;
  let selectedPeripheralId: string | null = null;

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error('A sensor-selection listener failed.', error);
      }
    }
  };

  const replaceDevice = async (next: DeviceConnection, nextKind: SensorKind, peripheralId: string | null) => {
    const previous = device;
    if (previous !== next) {
      await previous.disconnect().catch(() => undefined);
      if (previous instanceof BleSensorDevice) previous.dispose();
    }
    device = next;
    kind = nextKind;
    selectedPeripheralId = peripheralId;
    notify();
  };

  const requireBle = (): BleCentral => {
    if (!central) throw new Error('Real sensors need the development build; Expo Go cannot use Bluetooth.');
    return central;
  };

  return {
    bleSupport: central ? 'available' : 'needs_development_build',
    get kind() {
      return kind;
    },
    get device() {
      return device;
    },
    get selectedPeripheralId() {
      return selectedPeripheralId;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async useSimulated() {
      await scanner?.stop();
      await replaceDevice(simulated, 'simulated', null);
    },
    async chooseBle() {
      requireBle();
      if (kind === 'ble') return;
      await replaceDevice(new NoSensorPicked('Choose a sensor first: tap Scan, then pick it from the list.'), 'ble', null);
    },
    async useBleSensor(peripheralId) {
      const ble = requireBle();
      if (kind === 'ble' && selectedPeripheralId === peripheralId) return;
      await scanner?.stop();
      await replaceDevice(new BleSensorDevice({ central: ble, peripheralId, scheduler: options.scheduler }), 'ble', peripheralId);
    },
    async scanForSensors(onFound, onStopped) {
      requireBle();
      return scanner!.scan(onFound, { onStopped });
    },
    async stopScan() {
      await scanner?.stop();
    },
    bleSensorInfo() {
      return device instanceof BleSensorDevice && device.getState() === 'connected' ? device.getSensorInfo() : null;
    },
  };
}
