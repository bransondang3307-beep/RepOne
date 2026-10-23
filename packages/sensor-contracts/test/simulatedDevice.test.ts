import {
  DEMO_LOOP_SCRIPT,
  LABELLED_SET_SCRIPT,
  SimulatedDevice,
  generateTrace,
  type RawSensorSample,
  type SimulatedChannelSpec,
  type SimulatedDeviceOptions,
} from '../src';
import { ManualScheduler, describeDeviceConnectionContract, describeSensorSourceContract } from '../src/testing';
import { BASE_SIMULATION } from './fixtures';

// Two synthetic IMUs on one simulated device (not hardware): A rotates about x, B about y.
const CHANNEL_A: SimulatedChannelSpec = { script: LABELLED_SET_SCRIPT, simulation: { ...BASE_SIMULATION, sourceId: 'imu-a' } };
const CHANNEL_B: SimulatedChannelSpec = { script: DEMO_LOOP_SCRIPT, simulation: { ...BASE_SIMULATION, sourceId: 'imu-b', seed: 7, axis: 1 } };

function deviceHarness(overrides: Partial<SimulatedDeviceOptions> = {}) {
  const scheduler = new ManualScheduler();
  const device = new SimulatedDevice({ deviceId: 'sim-device-01', channels: [CHANNEL_A, CHANNEL_B], scheduler, ...overrides });
  return { device, scheduler, advance: (ms: number) => scheduler.advance(ms), loseConnection: () => device.simulateConnectionLoss() };
}

describeDeviceConnectionContract('SimulatedDevice (instant connect)', () => deviceHarness(), {
  createRefusingHarness: () => deviceHarness({ refuseConnect: { code: 'unavailable' } }),
});

describeDeviceConnectionContract('SimulatedDevice (200 ms connect)', () => deviceHarness({ connectDelayMs: 200 }), {
  connectTimeMs: 200,
  createRefusingHarness: () => deviceHarness({ connectDelayMs: 200, refuseConnect: { code: 'timeout' } }),
});

/** The first channel of a connected device, as a plain SensorSource. */
function channelHarness(overrides: Partial<SimulatedDeviceOptions> = {}, connect = true) {
  const { device, advance } = deviceHarness(overrides);
  if (connect) void device.connect();
  const source = connect ? device.getChannels()[0]!.source : channelOfDisconnected(device);
  return { source, advance };
}

function channelOfDisconnected(device: SimulatedDevice) {
  void device.connect();
  const source = device.getChannels()[0]!.source;
  void device.disconnect();
  return source;
}

describeSensorSourceContract('SimulatedDevice channel', () => channelHarness(), {
  createFailingHarness: () => channelHarness({ channels: [{ ...CHANNEL_A, fault: { afterSamples: 20, code: 'invalid_data' } }] }),
  createStartFailureHarness: () => channelHarness({}, false),
});

describe('SimulatedDevice', () => {
  it('streams each channel exactly as its script generates it', async () => {
    const { device, advance } = deviceHarness({ channels: [CHANNEL_A] });
    await device.connect();
    const received: RawSensorSample[] = [];
    const [channel] = device.getChannels();
    channel!.source.subscribe((s) => received.push(s));
    await channel!.source.start();
    advance(60_000);
    expect(channel!.source.getStatus()).toBe('stopped');
    expect(received).toEqual(generateTrace(LABELLED_SET_SCRIPT, CHANNEL_A.simulation).samples);
    expect(channel!.source.provenance).toBe('simulated');
    expect(channel!.source.kind).toBe('simulated');
  });

  it('keeps a fault on one channel from touching the other channel or the connection', async () => {
    const faulty: SimulatedChannelSpec = { ...CHANNEL_A, fault: { afterSamples: 30, code: 'invalid_data' } };
    const { device, advance } = deviceHarness({ channels: [faulty, CHANNEL_B] });
    await device.connect();
    const [a, b] = device.getChannels();
    const fromB: RawSensorSample[] = [];
    b!.source.subscribe((s) => fromB.push(s));
    await a!.source.start();
    await b!.source.start();
    advance(5000);
    expect(a!.source.getStatus()).toBe('error');
    expect(a!.source.getLastError()?.code).toBe('invalid_data');
    expect(b!.source.getStatus()).toBe('streaming');
    expect(device.getState()).toBe('connected');
    const loneB = deviceHarness({ channels: [CHANNEL_B] });
    await loneB.device.connect();
    const alone: RawSensorSample[] = [];
    loneB.device.getChannels()[0]!.source.subscribe((s) => alone.push(s));
    await loneB.device.getChannels()[0]!.source.start();
    loneB.advance(5000);
    expect(fromB).toEqual(alone);
  });

  it('on connection loss fails only the channels that were streaming', async () => {
    const { device, advance } = deviceHarness();
    await device.connect();
    const [a, b] = device.getChannels();
    await a!.source.start();
    advance(500);
    device.simulateConnectionLoss('cable unplugged (simulated)');
    expect(a!.source.getLastError()).toEqual({ code: 'connection_lost', message: 'cable unplugged (simulated)' });
    expect(b!.source.getStatus()).toBe('idle');
    expect(device.getLastError()).toEqual({ code: 'connection_lost', message: 'cable unplugged (simulated)' });
  });

  it('lets a later connect() succeed when only the first attempts are refused', async () => {
    const { device } = deviceHarness({ refuseConnect: { code: 'unavailable', message: 'port busy', attempts: 2 } });
    await expect(device.connect()).rejects.toThrow('port busy');
    await expect(device.connect()).rejects.toThrow('port busy');
    await device.connect();
    expect(device.getState()).toBe('connected');
    expect(device.getLastError()).toBeNull();
  });

  it('rejects an empty channel list and duplicate source_ids', () => {
    expect(() => new SimulatedDevice({ deviceId: 'd', channels: [] })).toThrow(/at least one channel/);
    expect(() => new SimulatedDevice({ deviceId: 'd', channels: [CHANNEL_A, CHANNEL_A] })).toThrow(/unique/);
  });
});
