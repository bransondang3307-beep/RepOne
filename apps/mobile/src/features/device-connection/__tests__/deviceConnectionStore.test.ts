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

describe('deviceConnectionStore', () => {
  it('mirrors the device through connect and disconnect', async () => {
    const store = createDeviceConnectionStore({ device: device() });
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
    const store = createDeviceConnectionStore({ device: device({ refuseConnect: { code: 'unavailable', message: 'Port busy (simulated)' } }) });
    await expect(store.getState().connect()).resolves.toBeUndefined();
    expect(store.getState()).toMatchObject({
      connectionState: 'failed',
      error: { code: 'unavailable', message: 'Port busy (simulated)' },
    });
  });

  it('shows a lost connection with its reason and clears it on reconnect', async () => {
    const simulated = device();
    const store = createDeviceConnectionStore({ device: simulated });
    await store.getState().connect();
    simulated.simulateConnectionLoss();
    expect(store.getState()).toMatchObject({ connectionState: 'failed', error: { code: 'connection_lost' } });
    await store.getState().connect();
    expect(store.getState()).toMatchObject({ connectionState: 'connected', error: null });
  });
});
