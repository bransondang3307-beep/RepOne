import { DeviceConnectError, SensorStartError, type RawSensorSample, type SensorStatus } from '@repone/sensor-contracts';
import { ManualScheduler, describeDeviceConnectionContract, describeSensorSourceContract } from '@repone/sensor-contracts/testing';
import { BLE_UUIDS, encodeDeviceInfo } from '@repone/sensor-protocol';
import { BleSensorDevice } from '../BleSensorDevice';
import { BleSensorScanner } from '../BleSensorScanner';
import { FakeBleCentral, FakePeripheral, type FakePeripheralOptions } from './FakeBleCentral';

// These tests drive the adapter against a fake central (SYNTHETIC packets). They verify state handling and data
// conversion, not radio connectivity: nothing here touches Bluetooth.

function setup(options: FakePeripheralOptions = {}, deviceOptions: { connectTimeoutMs?: number } = {}) {
  const scheduler = new ManualScheduler();
  const peripheral = new FakePeripheral(options);
  const central = new FakeBleCentral(scheduler, [peripheral]);
  const device = new BleSensorDevice({ central, peripheralId: peripheral.id, scheduler, ...deviceOptions });
  return { scheduler, peripheral, central, device, advance: (ms: number) => scheduler.advance(ms) };
}

const harness = (options: FakePeripheralOptions = {}) => {
  const s = setup(options);
  return { device: s.device, advance: s.advance, loseConnection: () => s.central.dropLink(s.peripheral.id) };
};

describeDeviceConnectionContract('BleSensorDevice (fake central, instant connect)', () => harness(), {
  createRefusingHarness: () => harness({ refuseConnect: true }),
});
describeDeviceConnectionContract('BleSensorDevice (fake central, 200 ms connect, 2 channels)', () => harness({ connectDelayMs: 200, channelCount: 2 }), {
  connectTimeMs: 200,
  createRefusingHarness: () => harness({ incompatibleGatt: true }),
});

/** A fresh, independent, connected device's first channel, as a SensorSource harness. */
async function connectedChannel(options: FakePeripheralOptions) {
  const s = setup(options);
  await s.device.connect();
  return { source: s.device.getChannels()[0]!.source, advance: s.advance };
}

// The sensor-source suite creates harnesses synchronously, sometimes two per test, which must be independent. A BLE
// connect is asynchronous, so each test gets a pool of separately connected devices prepared in beforeEach.
type ChannelHarness = Awaited<ReturnType<typeof connectedChannel>>;
const pools: Record<'normal' | 'failing' | 'startFailure', ChannelHarness[]> = { normal: [], failing: [], startFailure: [] };
const take = (pool: ChannelHarness[]) => {
  const next = pool.shift();
  if (!next) throw new Error('harness pool exhausted: raise its size in beforeEach');
  return next;
};

describe('BleSensorDevice channel as a SensorSource', () => {
  beforeEach(async () => {
    pools.normal = await Promise.all([1, 2, 3].map(() => connectedChannel({})));
    pools.failing = await Promise.all([1, 2].map(() => connectedChannel({ imuFailsAfterPackets: 3 })));
    pools.startFailure = await Promise.all([1, 2].map(() => connectedChannel({ failStartNotifications: true })));
  });
  describeSensorSourceContract('BLE channel (fake central)', () => take(pools.normal), {
    finite: false,
    createFailingHarness: () => take(pools.failing),
    createStartFailureHarness: () => take(pools.startFailure),
  });
});

async function connected(options: FakePeripheralOptions = {}) {
  const s = setup(options);
  await s.device.connect();
  return s;
}

function record(source: { subscribe: (l: (s: RawSensorSample) => void) => unknown; subscribeStatus: (l: (s: SensorStatus) => void) => unknown }) {
  const samples: RawSensorSample[] = [];
  const statuses: SensorStatus[] = [];
  source.subscribe((s) => samples.push(s));
  source.subscribeStatus((s) => statuses.push(s));
  return { samples, statuses };
}

describe('BleSensorDevice: identity, units and provenance', () => {
  it("takes the sensor's identity from its device-info packet, never from the phone's peripheral id", async () => {
    const { device } = await connected({ serial: '00001122aabbccdd', channelCount: 2, id: 'ios-per-phone-uuid' });
    expect(device.deviceId).toBe('imu-00001122aabbccdd');
    expect(device.getChannels().map((c) => c.source_id)).toEqual(['imu-00001122aabbccdd-ch0', 'imu-00001122aabbccdd-ch1']);
    expect(device.getSensorInfo()).toEqual({ deviceSerial: '00001122aabbccdd', channelCount: 2, nominalRateHz: 50, firmwareVersion: '0.1', status: 0 });
  });

  it('delivers real-sensor samples: kind ble, provenance sensor, converted units, never flagged synthetic', async () => {
    const { device, advance } = await connected();
    const [channel] = device.getChannels();
    expect(channel!.source.kind).toBe('ble');
    expect(channel!.source.provenance).toBe('sensor');
    const { samples } = record(channel!.source);
    await channel!.source.start();
    advance(1000);
    expect(samples.length).toBeGreaterThanOrEqual(45);
    expect(samples[0]!.accel_m_s2[2]).toBeCloseTo(9.80665, 10);
    expect(samples[0]!.gyro_rad_s[0]).toBeCloseTo(Math.PI / 180, 10);
    expect(samples.some((s) => s.quality_flags.includes('synthetic'))).toBe(false);
    for (let i = 1; i < samples.length; i++) expect(samples[i]!.timestamp_ms).toBeGreaterThanOrEqual(samples[i - 1]!.timestamp_ms);
  });

  it('routes each channel its own samples from the shared notification stream', async () => {
    const { device, advance } = await connected({ channelCount: 2 });
    const [a, b] = device.getChannels();
    const ra = record(a!.source);
    const rb = record(b!.source);
    await a!.source.start();
    await b!.source.start();
    advance(500);
    expect(ra.samples.length).toBeGreaterThan(0);
    expect(rb.samples.length).toBeGreaterThan(0);
    expect(ra.samples.every((s) => s.source_id === a!.source_id && s.accel_m_s2[0] === 0)).toBe(true);
    expect(rb.samples.every((s) => s.source_id === b!.source_id && s.accel_m_s2[0] > 0)).toBe(true);
  });
});

describe('BleSensorDevice: actionable connect failures (no fallback to simulation)', () => {
  const failure = async (device: BleSensorDevice) => {
    const error = await device.connect().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DeviceConnectError);
    expect(device.getState()).toBe('failed');
    expect(device.getChannels()).toEqual([]);
    return (error as DeviceConnectError).connectionError;
  };

  it.each([
    ['off', /Bluetooth is turned off/],
    ['unauthorized', /permission was denied/],
    ['unsupported', /does not support Bluetooth Low Energy/],
  ] as const)('Bluetooth %s → unavailable, with a message the user can act on', async (radio, message) => {
    const { device, central } = setup();
    central.radio = radio;
    const reason = await failure(device);
    expect(reason.code).toBe('unavailable');
    expect(reason.message).toMatch(message);
  });

  it('gives up after the connect timeout and cancels the attempt', async () => {
    const { device, advance, peripheral } = setup({ connectDelayMs: null }, { connectTimeoutMs: 10_000 });
    const pending = failure(device);
    for (let i = 0; i < 10; i++) await Promise.resolve(); // let the attempt reach the connect step and arm its timer
    advance(9_999);
    expect(device.getState()).toBe('connecting');
    advance(1);
    const reason = await pending;
    expect(reason.code).toBe('timeout');
    expect(peripheral.connected).toBe(false);
  });

  it('rejects a BLE device without the sensor service as not compatible', async () => {
    const { device } = setup({ incompatibleGatt: true });
    expect((await failure(device)).message).toMatch(/not a compatible sensor/);
  });

  it('rejects an unconfigured sensor (all-zero serial)', async () => {
    const bytes = encodeDeviceInfo({ deviceSerial: '0000000000000001', channelCount: 1, accelRange: 0, gyroRange: 0, nominalRateHz: 50, firmwareVersion: { major: 0, minor: 1 }, status: 0 });
    bytes.fill(0, 2, 10);
    const { device } = setup({ infoBytes: bytes });
    expect((await failure(device)).message).toMatch(/device information is invalid/);
  });

  it('reports a sensor whose IMU was not found', async () => {
    const { device } = setup({ infoStatus: 1 });
    expect((await failure(device)).message).toMatch(/IMU was not found/);
  });

  it('fails a channel start with start_failed when notifications cannot be enabled', async () => {
    const { device } = await connected({ failStartNotifications: true });
    const [channel] = device.getChannels();
    const error = await channel!.source.start().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SensorStartError);
    expect((error as SensorStartError).sensorError.code).toBe('start_failed');
  });
});

describe('BleSensorDevice: streaming failures end the run with a reason', () => {
  it('watchdog: no data for 1 s → stream_timeout', async () => {
    const { device, advance } = await connected({ silentAfterPackets: 2 });
    const [channel] = device.getChannels();
    await channel!.source.start();
    advance(200);
    expect(channel!.source.getStatus()).toBe('streaming');
    advance(1100);
    expect(channel!.source.getStatus()).toBe('error');
    expect(channel!.source.getLastError()?.code).toBe('stream_timeout');
  });

  it('five unreadable packets in a row → invalid_data', async () => {
    const { device, advance } = await connected({ corruptAfterPackets: 2 });
    const [channel] = device.getChannels();
    const { samples } = record(channel!.source);
    await channel!.source.start();
    advance(1000);
    expect(samples.length).toBe(10);
    expect(channel!.source.getLastError()?.code).toBe('invalid_data');
  });

  it('the sensor reporting an IMU read failure ends the run', async () => {
    const { device, advance } = await connected({ imuFailsAfterPackets: 3 });
    const [channel] = device.getChannels();
    await channel!.source.start();
    advance(1000);
    expect(channel!.source.getLastError()).toEqual({ code: 'unknown', message: 'The sensor reports that reading its IMU failed' });
    expect(device.getSensorInfo()?.status).toBe(2);
  });

  it('a stream restart mid-run (the sensor rebooted) ends the run with connection_lost', async () => {
    const { device, advance, peripheral, scheduler } = await connected();
    const [channel] = device.getChannels();
    const { samples } = record(channel!.source);
    await channel!.source.start();
    advance(300);
    const before = samples.length;
    peripheral.rebootStream(scheduler); // same subscription, new stream id, sequence and device time restart
    advance(100);
    expect(channel!.source.getStatus()).toBe('error');
    expect(channel!.source.getLastError()).toEqual({
      code: 'connection_lost',
      message: 'The sensor restarted its stream (it may have reset); the set cannot continue seamlessly',
    });
    expect(samples).toHaveLength(before);
  });

  it('turning Bluetooth off while connected fails the device and its streaming channel', async () => {
    const { device, advance, central } = await connected();
    const [channel] = device.getChannels();
    await channel!.source.start();
    advance(200);
    central.setRadio('off');
    expect(channel!.source.getLastError()?.code).toBe('connection_lost');
    expect(device.getState()).toBe('failed');
    expect(device.getLastError()?.message).toMatch(/Bluetooth is turned off/);
  });
});

describe('BleSensorDevice: reconnects never mix sessions or leak listeners', () => {
  it('after a link loss, reconnecting starts a fresh stream; old channel objects stay dead', async () => {
    const { device, advance, central, peripheral } = await connected();
    const [old] = device.getChannels();
    const first = record(old!.source);
    await old!.source.start();
    advance(300);
    central.dropLink(peripheral.id);
    const countAtLoss = first.samples.length;

    await device.connect();
    const [fresh] = device.getChannels();
    expect(fresh!.source).not.toBe(old!.source);
    const refused = await old!.source.start().then(
      () => null,
      (e: unknown) => e,
    );
    expect(refused).toBeInstanceOf(SensorStartError);
    const second = record(fresh!.source);
    await fresh!.source.start();
    advance(300);
    expect(first.samples).toHaveLength(countAtLoss);
    expect(second.samples.length).toBeGreaterThan(0);
    expect(peripheral.streamsStarted).toBe(2);
    expect(Math.min(...second.samples.map((s) => s.timestamp_ms))).toBeGreaterThanOrEqual(5000);
  });

  it('keeps one set of central listeners across many connect cycles, and dispose() removes them', async () => {
    const { device, central } = setup();
    for (let i = 0; i < 5; i++) {
      await device.connect();
      await device.disconnect();
    }
    expect(central.listenerCounts).toEqual({ disconnect: 1, radio: 1 });
    device.dispose();
    expect(central.listenerCounts).toEqual({ disconnect: 0, radio: 0 });
  });

  it('switches notifications off when the last channel stops, and the sensor stops streaming', async () => {
    const { device, advance, peripheral } = await connected({ channelCount: 2 });
    const [a, b] = device.getChannels();
    await a!.source.start();
    await b!.source.start();
    advance(200);
    await a!.source.stop();
    expect(peripheral.streaming).toBe(true);
    await b!.source.stop();
    for (let i = 0; i < 10; i++) await Promise.resolve(); // the disable is sent, not awaited, by stop()
    expect(peripheral.streaming).toBe(false);
  });

  it('ignores notifications that arrive after the channel stopped', async () => {
    const { device, advance } = await connected();
    const [channel] = device.getChannels();
    const { samples } = record(channel!.source);
    await channel!.source.start();
    advance(200);
    await channel!.source.stop();
    const count = samples.length;
    advance(1000);
    expect(samples).toHaveLength(count);
  });

  it('uses the protocol UUIDs for discovery and notifications', () => {
    expect(BLE_UUIDS.service).toMatch(/^19bc0001-/);
  });
});

// Orderings the OS can produce, found by Codex on PR #28 (review of ef72348). Each test holds one native operation
// mid-flight; each fails on ef72348.
describe('BleSensorDevice: asynchronous orderings (Codex round 1)', () => {
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  it("a retry waits until a failed attempt's link is torn down, so that teardown never hits the new link", async () => {
    const { device, central, peripheral } = setup({ failInfoReadOnce: true });
    const releaseDisconnect = central.hold('disconnect');
    await expect(device.connect()).rejects.toBeInstanceOf(DeviceConnectError);
    const retry = device.connect();
    await flush();
    expect(device.getState()).toBe('failed'); // still waiting for the old link's teardown
    releaseDisconnect();
    await retry;
    await flush();
    expect(device.getState()).toBe('connected');
    expect(peripheral.connected).toBe(true);
  });

  it('a start cancelled while notifications are being enabled is retired: a new start() makes its own run', async () => {
    const { device, central, advance } = await connected();
    const [channel] = device.getChannels();
    const { samples } = record(channel!.source);
    const releaseEnable = central.hold('startNotifications');
    const cancelled = channel!.source.start();
    const stopping = channel!.source.stop();
    const fresh = channel!.source.start();
    expect(fresh).not.toBe(cancelled);
    releaseEnable();
    await cancelled;
    await stopping;
    await fresh;
    expect(channel!.source.getStatus()).toBe('streaming');
    advance(500);
    expect(samples.length).toBeGreaterThan(0);
  });

  it('a cancelled start releases the notifications it asked for once they come up', async () => {
    const { device, central, peripheral } = await connected();
    const [channel] = device.getChannels();
    const releaseEnable = central.hold('startNotifications');
    const cancelled = channel!.source.start();
    const stopping = channel!.source.stop();
    releaseEnable();
    await cancelled;
    await stopping;
    await flush();
    expect(channel!.source.getStatus()).toBe('idle');
    expect(peripheral.streaming).toBe(false);
  });

  it('stop() then start(): the new enable waits for the disable, which therefore cannot cut the new run off', async () => {
    const { device, central, peripheral, advance } = await connected();
    const [channel] = device.getChannels();
    const { samples } = record(channel!.source);
    await channel!.source.start();
    advance(200);
    const releaseDisable = central.hold('stopNotifications');
    const stopping = channel!.source.stop();
    const restarting = channel!.source.start();
    await flush();
    expect(peripheral.streamsStarted).toBe(1); // the enable is queued behind the disable
    releaseDisable();
    await stopping;
    await restarting;
    const before = samples.length;
    advance(1500);
    expect(channel!.source.getStatus()).toBe('streaming');
    expect(samples.length).toBeGreaterThan(before);
    expect(peripheral.streamsStarted).toBe(2);
  });

  it('a scan stopped while still preparing (e.g. at the permission prompt) never starts', async () => {
    const scheduler = new ManualScheduler();
    const central = new FakeBleCentral(scheduler, [new FakePeripheral({ id: 'p1' })]);
    const scanner = new BleSensorScanner(central, scheduler);
    const releasePrepare = central.hold('prepare');
    const found: unknown[] = [];
    const scanning = scanner.scan((p) => found.push(p));
    await flush();
    await scanner.stop();
    releasePrepare();
    await scanning;
    expect(found).toEqual([]);
    expect(central.isScanning).toBe(false);
    expect(scanner.scanning).toBe(false);
  });
});

// Found by Codex on PR #28's round-1 head (233a78c): the round-1 serialization must never hang on a native operation
// that does not answer, nor reach a later link. The first, second and fourth tests fail on 233a78c; the third guards
// the sensor-switch path.
describe('BleSensorDevice: native operations that never answer, and stale disables (Codex round 2)', () => {
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  it('disconnect() closes the link even when a stopped start is still waiting for an enable that never answers', async () => {
    const { device, central, peripheral, advance } = await connected();
    const [channel] = device.getChannels();
    central.hold('startNotifications'); // never released
    const start = channel!.source.start();
    await channel!.source.stop();
    const closing = device.disconnect();
    advance(60_000);
    await closing;
    expect(device.getState()).toBe('disconnected');
    expect(peripheral.connected).toBe(false);
    await expect(start).resolves.toBeUndefined(); // cancelled by stop(): settles quietly once the link is gone
    expect(channel!.source.getStatus()).toBe('idle');
  });

  it('a start still waiting for an enable that never answers fails with connection_lost when the link drops', async () => {
    const { device, central, peripheral } = await connected();
    const [channel] = device.getChannels();
    central.hold('startNotifications'); // never released
    const start = channel!.source.start();
    await flush(); // the enable is now in flight, and held
    central.dropLink(peripheral.id);
    const failure = await start.then(
      () => null,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(SensorStartError);
    expect((failure as SensorStartError).sensorError.code).toBe('connection_lost');
  });

  it('switching to another sensor never hangs on an enable that does not answer', async () => {
    const { device, central } = await connected();
    const [channel] = device.getChannels();
    central.hold('startNotifications'); // never released
    void channel!.source.start();
    await flush(); // the enable is now in flight, and held
    await device.disconnect(); // what SensorSelection does before replacing the device
    expect(device.getState()).toBe('disconnected');
  });

  it('a disable queued before a link loss is skipped: it never switches off the next connection', async () => {
    const { device, central, peripheral, advance } = await connected();
    const [old] = device.getChannels();
    const releaseEnable = central.hold('startNotifications');
    void old!.source.start().catch(() => undefined);
    await old!.source.stop(); // queues the disable behind the pending enable
    central.dropLink(peripheral.id);
    await device.connect();
    const [fresh] = device.getChannels();
    const { samples } = record(fresh!.source);
    const starting = fresh!.source.start();
    releaseEnable();
    await starting;
    await flush();
    advance(1500);
    expect(fresh!.source.getStatus()).toBe('streaming');
    expect(samples.length).toBeGreaterThan(0);
    expect(peripheral.streaming).toBe(true);
  });
});
