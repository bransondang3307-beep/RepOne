import { DEMO_LOOP_SCRIPT, SimulatedDevice, type ConnectionState } from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createDeviceConnectionStore } from '../deviceConnectionStore';

// Simulated devices only — no hardware.
function device(options: Partial<ConstructorParameters<typeof SimulatedDevice>[0]> = {}) {
  return new SimulatedDevice({
    deviceId: 'simulated-device-01',
    scheduler: new ManualScheduler(),
    channels: [{ script: DEMO_LOOP_SCRIPT, simulation: { sourceId: 'simulated-imu-01', sampleRateHz: 50, seed: 1 } }],
    ...options,
  });
}

/** The container slice the store needs, as the composition root builds it for the simulated device. */
const simulatedContainer = (simulated: SimulatedDevice) => ({
  device: simulated,
  simulateConnectionLoss: () => simulated.simulateConnectionLoss('connection loss simulated from the app'),
});

describe('deviceConnectionStore', () => {
  it('mirrors the device through connect and disconnect', async () => {
    const store = createDeviceConnectionStore(simulatedContainer(device()));
    const seen: ConnectionState[] = [];
    store.subscribe((s) => seen.push(s.connectionState));
    expect(store.getState()).toMatchObject({
      deviceId: 'simulated-device-01',
      transport: 'simulated',
      connectionState: 'disconnected',
      error: null,
    });

    await store.getState().connect();
    expect(store.getState().connectionState).toBe('connected');
    await store.getState().disconnect();
    expect(store.getState().connectionState).toBe('disconnected');
    expect(seen).toEqual(['connecting', 'connected', 'disconnecting', 'disconnected']);
  });

  it('shows a refused connect as failed with its reason, without throwing', async () => {
    const store = createDeviceConnectionStore(
      simulatedContainer(device({ refuseConnect: { code: 'unavailable', message: 'Port busy (simulated)' } })),
    );
    await expect(store.getState().connect()).resolves.toBeUndefined();
    expect(store.getState()).toMatchObject({
      connectionState: 'failed',
      error: { code: 'unavailable', message: 'Port busy (simulated)' },
    });
  });

  it('shows a lost connection with its reason and clears it on reconnect', async () => {
    const store = createDeviceConnectionStore(simulatedContainer(device()));
    await store.getState().connect();
    store.getState().simulateConnectionLoss();
    expect(store.getState()).toMatchObject({ connectionState: 'failed', error: { code: 'connection_lost' } });
    await store.getState().connect();
    expect(store.getState()).toMatchObject({ connectionState: 'connected', error: null });
  });

  it('offers the simulate-connection-loss control only when the container provides it', async () => {
    const simulated = createDeviceConnectionStore(simulatedContainer(device()));
    expect(simulated.getState().canSimulateConnectionLoss).toBe(true);
    await simulated.getState().connect();
    simulated.getState().simulateConnectionLoss();
    expect(simulated.getState().error).toEqual({ code: 'connection_lost', message: 'connection loss simulated from the app' });

    // A real device's container has no test hook: the control is hidden and the action does nothing.
    const real = createDeviceConnectionStore({ device: device(), simulateConnectionLoss: null });
    expect(real.getState().canSimulateConnectionLoss).toBe(false);
    await real.getState().connect();
    real.getState().simulateConnectionLoss();
    expect(real.getState().connectionState).toBe('connected');
  });
});
