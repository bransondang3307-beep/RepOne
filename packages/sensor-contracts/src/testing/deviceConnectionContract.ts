import { DeviceConnectError, type ConnectionErrorCode, type ConnectionState, type DeviceConnection } from '../device';
import { SensorStartError, type RawSensorSample } from '../sensor';

export interface DeviceConnectionHarness {
  readonly device: DeviceConnection;
  /** Drive the device forward in time (e.g. advance a ManualScheduler). */
  advance(ms: number): void;
  /** Make the link drop now. Enables the connection-loss test. */
  readonly loseConnection?: () => void;
}

export interface DeviceConnectionContractOptions {
  /** How long connect() takes in the harness, ms; the suite advances this much. Default 0. */
  readonly connectTimeMs?: number;
  /** A harness whose connect() fails. Enables the refused-connect test. */
  readonly createRefusingHarness?: () => DeviceConnectionHarness;
}

const CONNECTION_ERROR_CODES: readonly ConnectionErrorCode[] = ['unavailable', 'timeout', 'connection_lost', 'unknown'];

function recordStates(device: DeviceConnection): ConnectionState[] {
  const states: ConnectionState[] = [];
  device.subscribeState((s) => states.push(s));
  return states;
}

/**
 * Shared Jest contract suite for DeviceConnection implementations (ADR 0007 §4): the simulated device now,
 * USB-serial and BLE adapters later. The harness's device must have at least one channel that streams
 * at least one sample per second while connected.
 */
export function describeDeviceConnectionContract(
  name: string,
  createHarness: () => DeviceConnectionHarness,
  options: DeviceConnectionContractOptions = {},
): void {
  const connectTimeMs = options.connectTimeMs ?? 0;
  const connect = async ({ device, advance }: DeviceConnectionHarness) => {
    const pending = device.connect();
    advance(connectTimeMs);
    await pending;
  };

  describe(`DeviceConnection contract: ${name}`, () => {
    it('starts disconnected, with no channels and no error', () => {
      const { device } = createHarness();
      expect(device.getState()).toBe('disconnected');
      expect(device.getChannels()).toEqual([]);
      expect(device.getLastError()).toBeNull();
    });

    it('connects, then offers channels whose sources stream their own source_id', async () => {
      const harness = createHarness();
      const { device, advance } = harness;
      const states = recordStates(device);
      await connect(harness);
      expect(states).toEqual(['connecting', 'connected']);
      const channels = device.getChannels();
      expect(channels.length).toBeGreaterThan(0);
      expect(new Set(channels.map((c) => c.source_id)).size).toBe(channels.length);

      const received = new Map<string, RawSensorSample[]>(channels.map((c) => [c.source_id, []]));
      for (const c of channels) c.source.subscribe((s) => received.get(c.source_id)!.push(s));
      for (const c of channels) await c.source.start();
      advance(1000);
      for (const c of channels) {
        const samples = received.get(c.source_id)!;
        expect(samples.length).toBeGreaterThan(0);
        expect(samples.every((s) => s.source_id === c.source_id)).toBe(true);
        await c.source.stop();
      }
    });

    it('treats connect() as idempotent', async () => {
      const harness = createHarness();
      const states = recordStates(harness.device);
      const first = harness.device.connect();
      const second = harness.device.connect();
      harness.advance(connectTimeMs);
      await Promise.all([first, second]);
      await harness.device.connect();
      expect(states).toEqual(['connecting', 'connected']);
    });

    it('disconnects: stops streaming channels and clears the channel list', async () => {
      const harness = createHarness();
      const { device, advance } = harness;
      await connect(harness);
      const [channel] = device.getChannels();
      const samples: RawSensorSample[] = [];
      channel!.source.subscribe((s) => samples.push(s));
      await channel!.source.start();
      advance(200);
      const states = recordStates(device);

      await device.disconnect();
      expect(states).toEqual(['disconnecting', 'disconnected']);
      expect(channel!.source.getStatus()).toBe('stopped');
      expect(device.getChannels()).toEqual([]);
      const count = samples.length;
      advance(1000);
      expect(samples).toHaveLength(count);
      await device.disconnect();
      expect(states).toEqual(['disconnecting', 'disconnected']);
    });

    it('treats disconnect() as a no-op when never connected', async () => {
      const { device } = createHarness();
      const states = recordStates(device);
      await device.disconnect();
      expect(states).toEqual([]);
      expect(device.getState()).toBe('disconnected');
    });

    it('refuses to start a channel while disconnected, and streams again after reconnecting', async () => {
      const harness = createHarness();
      const { device, advance } = harness;
      await connect(harness);
      const [channel] = device.getChannels();
      await device.disconnect();

      const refused = await channel!.source.start().then(
        () => null,
        (e: unknown) => e,
      );
      expect(refused).toBeInstanceOf(SensorStartError);
      expect((refused as SensorStartError).sensorError.code).toBe('start_failed');

      await connect(harness);
      const samples: RawSensorSample[] = [];
      device.getChannels()[0]!.source.subscribe((s) => samples.push(s));
      await device.getChannels()[0]!.source.start();
      advance(1000);
      expect(samples.length).toBeGreaterThan(0);
      await device.disconnect();
    });

    it('waits for a pending connect before disconnecting', async () => {
      const harness = createHarness();
      const states = recordStates(harness.device);
      const connecting = harness.device.connect();
      const disconnecting = harness.device.disconnect();
      harness.advance(connectTimeMs);
      await connecting;
      await disconnecting;
      expect(states).toEqual(['connecting', 'connected', 'disconnecting', 'disconnected']);
    });

    it('makes a disconnect() called from a `connecting` listener wait for that attempt', async () => {
      const harness = createHarness();
      const states = recordStates(harness.device);
      let disconnecting: Promise<void> | null = null;
      harness.device.subscribeState((s) => {
        if (s === 'connecting') disconnecting = harness.device.disconnect();
      });
      const connecting = harness.device.connect();
      harness.advance(connectTimeMs);
      await connecting;
      await disconnecting;
      expect(states).toEqual(['connecting', 'connected', 'disconnecting', 'disconnected']);
      expect(harness.device.getState()).toBe('disconnected');
    });

    it('stops notifying unsubscribed state listeners', async () => {
      const harness = createHarness();
      const removed = jest.fn();
      harness.device.subscribeState(removed)();
      await connect(harness);
      await harness.device.disconnect();
      expect(removed).not.toHaveBeenCalled();
    });

    if (createHarness().loseConnection) {
      it('on connection loss: fails every streaming channel, then the device, with a reason; connect() recovers', async () => {
        const harness = createHarness();
        const { device, advance } = harness;
        await connect(harness);
        const channels = device.getChannels();
        const samples: RawSensorSample[] = [];
        for (const c of channels) {
          c.source.subscribe((s) => samples.push(s));
          await c.source.start();
        }
        advance(200);
        const states = recordStates(device);
        let errorWhenPublished: unknown = 'not published';
        let channelsWhenPublished: unknown = 'not published';
        device.subscribeState((s) => {
          if (s !== 'failed') return;
          errorWhenPublished = device.getLastError();
          // Channels must already have failed when the device publishes `failed`.
          channelsWhenPublished = channels.map((c) => [c.source.getStatus(), c.source.getLastError()?.code]);
        });

        harness.loseConnection!();
        expect(states).toEqual(['failed']);
        expect(device.getLastError()?.code).toBe('connection_lost');
        expect(errorWhenPublished).toEqual(device.getLastError());
        expect(channelsWhenPublished).toEqual(channels.map(() => ['error', 'connection_lost']));
        for (const c of channels) {
          expect(c.source.getStatus()).toBe('error');
          expect(c.source.getLastError()?.code).toBe('connection_lost');
        }
        expect(device.getChannels()).toEqual([]);
        const count = samples.length;
        advance(1000);
        expect(samples).toHaveLength(count);

        await device.disconnect();
        expect(device.getState()).toBe('failed');
        await connect(harness);
        expect(device.getState()).toBe('connected');
        expect(device.getLastError()).toBeNull();
        await device.disconnect();
      });

      it('delivers nothing more once a sample listener triggers connection loss', async () => {
        const harness = createHarness();
        await connect(harness);
        const [channel] = harness.device.getChannels();
        let received = 0;
        channel!.source.subscribe(() => {
          received += 1;
          if (received === 1) harness.loseConnection!();
        });
        await channel!.source.start();
        harness.advance(1000);
        expect(received).toBe(1);
        expect(channel!.source.getStatus()).toBe('error');
      });

      it('fails a channel whose start() is still pending when the connection is lost', async () => {
        const harness = createHarness();
        await connect(harness);
        const [channel] = harness.device.getChannels();
        const samples: RawSensorSample[] = [];
        channel!.source.subscribe((s) => samples.push(s));
        const starting = channel!.source.start();
        harness.loseConnection!();
        const failure = await starting.then(
          () => null,
          (e: unknown) => e,
        );
        expect(failure).toBeInstanceOf(SensorStartError);
        expect((failure as SensorStartError).sensorError.code).toBe('connection_lost');
        harness.advance(1000);
        expect(samples).toHaveLength(0);
        expect(channel!.source.getStatus()).toBe('error');
        expect(harness.device.getState()).toBe('failed');
      });
    }

    const { createRefusingHarness } = options;
    if (createRefusingHarness) {
      it('rejects connect() with a DeviceConnectError and reports failed when the device refuses', async () => {
        const harness = createRefusingHarness();
        const states = recordStates(harness.device);
        const pending = harness.device.connect();
        harness.advance(connectTimeMs);
        const failure = await pending.then(
          () => null,
          (e: unknown) => e,
        );
        expect(failure).toBeInstanceOf(DeviceConnectError);
        expect(states).toEqual(['connecting', 'failed']);
        expect(CONNECTION_ERROR_CODES).toContain(harness.device.getLastError()!.code);
        expect((failure as DeviceConnectError).connectionError).toEqual(harness.device.getLastError());
        expect(harness.device.getChannels()).toEqual([]);
      });
    }
  });
}
