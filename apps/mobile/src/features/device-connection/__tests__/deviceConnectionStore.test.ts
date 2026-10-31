import { DEMO_LOOP_SCRIPT, SimulatedDevice, type ConnectionState } from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createSensorSelection } from '../../../application/sensorSelection';
import { FakeBleCentral, FakePeripheral } from '../../../infrastructure/bluetooth/__tests__/FakeBleCentral';
import { createDeviceConnectionStore } from '../deviceConnectionStore';

// Simulated devices and a fake BLE central only (SYNTHETIC data) — no hardware, no radio.
function device(options: Partial<ConstructorParameters<typeof SimulatedDevice>[0]> = {}) {
  return new SimulatedDevice({
    deviceId: 'simulated-device-01',
    scheduler: new ManualScheduler(),
    channels: [{ script: DEMO_LOOP_SCRIPT, simulation: { sourceId: 'simulated-imu-01', sampleRateHz: 50, seed: 1 } }],
    ...options,
  });
}

/** The container slice the store needs, as the composition root builds it. `central: null` = Expo Go (no BLE). */
function container(simulated: SimulatedDevice, central: FakeBleCentral | null = null, scheduler = new ManualScheduler()) {
  const sensors = createSensorSelection({ simulated, central, scheduler });
  return {
    sensors,
    simulateConnectionLoss: () => {
      if (sensors.device === simulated) simulated.simulateConnectionLoss('connection loss simulated from the app');
    },
  };
}

describe('deviceConnectionStore', () => {
  it('mirrors the device through connect and disconnect', async () => {
    const store = createDeviceConnectionStore(container(device()));
    const seen: ConnectionState[] = [];
    store.subscribe((s) => seen.push(s.connectionState));
    expect(store.getState()).toMatchObject({
      deviceId: 'simulated-device-01',
      transport: 'simulated',
      connectionState: 'disconnected',
      error: null,
      sensorKind: 'simulated',
    });

    await store.getState().connect();
    expect(store.getState().connectionState).toBe('connected');
    await store.getState().disconnect();
    expect(store.getState().connectionState).toBe('disconnected');
    expect(seen).toEqual(['connecting', 'connected', 'disconnecting', 'disconnected']);
  });

  it('shows a refused connect as failed with its reason, without throwing', async () => {
    const store = createDeviceConnectionStore(
      container(device({ refuseConnect: { code: 'unavailable', message: 'Port busy (simulated)' } })),
    );
    await expect(store.getState().connect()).resolves.toBeUndefined();
    expect(store.getState()).toMatchObject({
      connectionState: 'failed',
      error: { code: 'unavailable', message: 'Port busy (simulated)' },
    });
  });

  it('shows a lost connection with its reason and clears it on reconnect', async () => {
    const store = createDeviceConnectionStore(container(device()));
    await store.getState().connect();
    store.getState().simulateConnectionLoss();
    expect(store.getState()).toMatchObject({ connectionState: 'failed', error: { code: 'connection_lost' } });
    await store.getState().connect();
    expect(store.getState()).toMatchObject({ connectionState: 'connected', error: null });
  });

  it('offers the simulate-connection-loss control only for the simulated device', async () => {
    const scheduler = new ManualScheduler();
    const central = new FakeBleCentral(scheduler, [new FakePeripheral({ id: 'p1', name: 'IMU a1b2' })]);
    const store = createDeviceConnectionStore(container(device(), central, scheduler));
    expect(store.getState().canSimulateConnectionLoss).toBe(true);

    await store.getState().chooseBle();
    await store.getState().selectSensor('p1');
    await store.getState().connect();
    expect(store.getState().canSimulateConnectionLoss).toBe(false);
    store.getState().simulateConnectionLoss();
    expect(store.getState().connectionState).toBe('connected');
  });

  it('in Expo Go (no BLE module) offers simulation only and says why', async () => {
    const store = createDeviceConnectionStore(container(device(), null));
    expect(store.getState().bleSupport).toBe('needs_development_build');
    await expect(store.getState().chooseBle()).rejects.toThrow(/development build/);
    expect(store.getState().sensorKind).toBe('simulated');
  });

  it('choosing Bluetooth without a sensor never falls back to simulation', async () => {
    const scheduler = new ManualScheduler();
    const store = createDeviceConnectionStore(container(device(), new FakeBleCentral(scheduler, []), scheduler));
    await store.getState().chooseBle();
    expect(store.getState()).toMatchObject({ sensorKind: 'ble', transport: 'ble', selectedPeripheralId: null });
    await store.getState().connect();
    expect(store.getState()).toMatchObject({
      connectionState: 'failed',
      error: { code: 'unavailable', message: 'Choose a sensor first: tap Scan, then pick it from the list.' },
    });
  });

  it('scans by service UUID, lists sensors once, then connects the picked one and shows its own identity', async () => {
    const scheduler = new ManualScheduler();
    const central = new FakeBleCentral(scheduler, [
      new FakePeripheral({ id: 'p1', name: 'IMU a1b2', serial: '0000a1b2c3d4e5f6' }),
      new FakePeripheral({ id: 'p2', name: null, serial: '0000ffffeeeedddd' }),
    ]);
    const store = createDeviceConnectionStore(container(device(), central, scheduler));
    await store.getState().chooseBle();
    await store.getState().scan();
    expect(central.scanFilter).toEqual(['19bc0001-bab5-4ddb-8e9c-8595137ac300']);
    expect(store.getState()).toMatchObject({
      scanning: true,
      discovered: [
        { peripheralId: 'p1', name: 'IMU a1b2', rssi: -60 },
        { peripheralId: 'p2', name: 'IMU sensor', rssi: -60 },
      ],
    });
    scheduler.advance(10_000);
    await Promise.resolve();
    expect(store.getState().scanning).toBe(false);
    expect(central.isScanning).toBe(false);

    await store.getState().selectSensor('p2');
    expect(store.getState().connectionState).toBe('disconnected'); // nothing connects until asked
    await store.getState().connect();
    expect(store.getState()).toMatchObject({
      connectionState: 'connected',
      deviceId: 'imu-0000ffffeeeedddd',
      selectedPeripheralId: 'p2',
      sensorSummary: 'Sensor 0000ffffeeeedddd · firmware 0.1 · 50 Hz · 1 IMU',
    });
  });

  it('reports Bluetooth off or denied when scanning, with an actionable message', async () => {
    const scheduler = new ManualScheduler();
    const central = new FakeBleCentral(scheduler, []);
    central.radio = 'unauthorized';
    const store = createDeviceConnectionStore(container(device(), central, scheduler));
    await store.getState().chooseBle();
    await store.getState().scan();
    expect(store.getState()).toMatchObject({ scanning: false, scanMessage: expect.stringMatching(/permission was denied/) });
  });

  it('switching sensors disconnects the previous one and follows the new device', async () => {
    const scheduler = new ManualScheduler();
    const central = new FakeBleCentral(scheduler, [new FakePeripheral({ id: 'p1' })]);
    const simulated = device();
    const store = createDeviceConnectionStore(container(simulated, central, scheduler));
    await store.getState().connect();
    expect(simulated.getState()).toBe('connected');

    await store.getState().chooseBle();
    expect(simulated.getState()).toBe('disconnected');
    await store.getState().selectSensor('p1');
    await store.getState().connect();
    expect(store.getState().transport).toBe('ble');

    await store.getState().chooseSimulated();
    expect(central.peripheral('p1').connected).toBe(false);
    expect(store.getState()).toMatchObject({ sensorKind: 'simulated', transport: 'simulated', connectionState: 'disconnected' });
    expect(central.listenerCounts).toEqual({ disconnect: 0, radio: 0 });
  });
});
