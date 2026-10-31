import {
  BaseSensorSource,
  DeviceConnectError,
  SensorStartError,
  systemScheduler,
  type ConnectionError,
  type ConnectionState,
  type DeviceChannel,
  type DeviceConnection,
  type RawSensorSample,
  type Scheduler,
  type SensorError,
  type Unsubscribe,
} from '@repone/sensor-contracts';
import {
  BLE_UUIDS,
  DeviceStatus,
  StreamTracker,
  decodePacket,
  type DeviceInfoPacket,
  type SamplePacket,
} from '@repone/sensor-protocol';
import type { BleCentral, BleCharacteristicInfo, BleRadioState } from './BleCentral';

export interface BleSensorDeviceOptions {
  readonly central: BleCentral;
  /** The peripheral the user picked from a scan (the OS's handle, not the sensor's identity). */
  readonly peripheralId: string;
  /** Timers (connect timeout, stream watchdog). Tests pass a ManualScheduler. */
  readonly scheduler?: Scheduler;
  /** Give up connecting after this long, ms. Default 10 000 (iOS connects never time out on their own). */
  readonly connectTimeoutMs?: number;
  /** A streaming channel with no valid sample for this long fails with `stream_timeout`, ms. Default 1000. */
  readonly streamTimeoutMs?: number;
  /** This many undecodable packets in a row fail the streaming channels with `invalid_data`. Default 5. */
  readonly maxConsecutiveBadPackets?: number;
}

const WATCHDOG_TICK_MS = 250;
/** How long a teardown waits for the OS's disconnect event, which never comes if no link was established. */
const DISCONNECT_EVENT_GRACE_MS = 2000;

/** What the device reported about itself on the last successful connect. For diagnostics in the UI. */
export interface BleSensorInfo {
  readonly deviceSerial: string;
  readonly channelCount: number;
  readonly nominalRateHz: number;
  readonly firmwareVersion: string;
  readonly status: number;
}

/** What to tell the user when Bluetooth is not usable. */
export const RADIO_MESSAGES: Record<Exclude<BleRadioState, 'on'>, string> = {
  off: 'Bluetooth is turned off. Turn it on in Settings or Control Centre.',
  unauthorized: 'Bluetooth permission was denied. Allow it for this app in Settings.',
  unsupported: 'This phone does not support Bluetooth Low Energy.',
  resetting: 'Bluetooth is restarting. Try again in a moment.',
  unknown: 'Bluetooth is not ready yet. Try again in a moment.',
};

const DEVICE_STATUS_MESSAGES: Record<number, string> = {
  [DeviceStatus.ImuNotFound]: 'The sensor reports that its IMU was not found',
  [DeviceStatus.ImuReadFailed]: 'The sensor reports that reading its IMU failed',
  [DeviceStatus.MtuTooSmall]: 'The Bluetooth link cannot carry one sample packet (MTU too small)',
};

const describeStatus = (status: number) => DEVICE_STATUS_MESSAGES[status] ?? `The sensor reports error status ${status}`;

class ConnectFailure extends Error {
  constructor(readonly connectionError: ConnectionError) {
    super(connectionError.message);
  }
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * A real IMU sensor over Bluetooth Low Energy (RO-029; ADR 0007 §4, ADR 0008). It implements `DeviceConnection`
 * like the simulated device, so nothing downstream changes:
 * - connect: radio and permission check, bounded connect, service discovery, then the device-info packet, which
 *   gives the sensor's identity (`imu-<serial>`) and its channels (`imu-<serial>-ch<n>`);
 * - a channel's start() enables sample notifications (one subscription for the device, shared by its channels);
 *   packets are decoded and tracked (`@repone/sensor-protocol`), and each channel receives its own samples in order;
 * - samples carry `sensor` provenance and are never marked synthetic. No fallback to simulation, ever: a failure is
 *   reported with its reason.
 */
export class BleSensorDevice implements DeviceConnection {
  readonly transport = 'ble' as const;
  private readonly central: BleCentral;
  private readonly scheduler: Scheduler;
  private readonly listeners = new Set<(state: ConnectionState) => void>();
  private readonly tracker: StreamTracker;
  private state: ConnectionState = 'disconnected';
  private lastError: ConnectionError | null = null;
  private pending: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private dropping = false;
  private lossPublished: Promise<void> | null = null;
  private droppedWhileConnecting = false;
  private readonly unpublished: ConnectionState[] = [];
  private publishing = false;
  /** Bumped on every connect, disconnect and loss: callbacks from an older link are ignored. */
  private linkEpoch = 0;
  private channels: BleDeviceChannel[] = [];
  private info: DeviceInfoPacket | null = null;
  private notifying: Promise<void> | null = null;
  private notifyingEpoch = -1;
  private watchdog: unknown = null;
  private badPacketsInARow = 0;
  /** Disabling notifications, still in flight: the next enable waits for it, so it cannot cut the new run off. */
  private notifyShutdown: Promise<void> | null = null;
  /** Whether the current attempt asked the OS to connect, so a failure must tear the link down. */
  private linkOpened = false;
  /** Our own disconnect, still in flight (including its OS event): the next connect waits for it. */
  private teardown: Promise<void> | null = null;
  /** Set while we expect the OS's event for our own disconnect: that event is ours, not a link loss. */
  private ownDisconnect: (() => void) | null = null;
  private readonly unsubscribeCentral: Unsubscribe[];

  constructor(private readonly options: BleSensorDeviceOptions) {
    this.central = options.central;
    this.scheduler = options.scheduler ?? systemScheduler;
    this.tracker = new StreamTracker({ sourceIdFor: (channel) => this.sourceIdFor(channel) });
    this.unsubscribeCentral = [
      this.central.subscribeDisconnect((id) => {
        if (id !== options.peripheralId) return;
        if (this.ownDisconnect) this.ownDisconnect();
        else this.linkLost('The Bluetooth connection to the sensor was lost');
      }),
      this.central.subscribeRadioState((radio) => {
        if (radio !== 'on') this.linkLost(RADIO_MESSAGES[radio]);
      }),
    ];
  }

  /** `imu-<serial>` once the sensor has identified itself; until then a placeholder that is never stored. */
  get deviceId(): string {
    return this.info ? `imu-${this.info.deviceSerial}` : `ble-unidentified:${this.options.peripheralId}`;
  }

  get peripheralId(): string {
    return this.options.peripheralId;
  }

  /** What the sensor reported on the last connect; null before the first one. */
  getSensorInfo(): BleSensorInfo | null {
    const info = this.info;
    if (!info) return null;
    return {
      deviceSerial: info.deviceSerial,
      channelCount: info.channelCount,
      nominalRateHz: info.nominalRateHz,
      firmwareVersion: `${info.firmwareVersion.major}.${info.firmwareVersion.minor}`,
      status: info.status,
    };
  }

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
    return this.isLive(this.linkEpoch) ? this.channels.map((c) => c.channel) : [];
  }

  connect(): Promise<void> {
    if (this.lossPublished) return this.lossPublished.then(() => this.connect());
    if (this.state === 'connected') return Promise.resolve();
    if (this.pending) return this.pending;
    if (this.closing) return this.closing.then(() => this.connect());
    // A failed attempt's link is still being torn down: never let its late disconnect hit this attempt.
    if (this.teardown) return this.teardown.then(() => this.connect());
    let settle!: { resolve: () => void; reject: (error: unknown) => void };
    const pending = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    const epoch = ++this.linkEpoch;
    this.droppedWhileConnecting = false;
    this.linkOpened = false;
    // Install the attempt before publishing `connecting`, so a listener's connect()/disconnect() sees and waits for it.
    this.pending = pending;
    this.setState('connecting');
    this.establish(epoch).then(
      (channels) => {
        this.pending = null;
        this.channels = channels;
        this.setState('connected');
        settle.resolve();
      },
      (error: unknown) => {
        this.pending = null;
        const reason =
          error instanceof ConnectFailure ? error.connectionError : { code: 'unknown' as const, message: messageOf(error) };
        // Install the teardown before publishing `failed`, so a retry from a listener waits for it.
        if (this.linkOpened) void this.tearDownLink();
        this.fail(reason);
        settle.reject(new DeviceConnectError(reason));
      },
    );
    return pending;
  }

  async disconnect(): Promise<void> {
    if (this.lossPublished) await this.lossPublished;
    if (this.pending) await this.pending.catch(() => undefined);
    if (this.closing) return this.closing;
    if (this.state !== 'connected') return;
    // Install the disconnect before publishing `disconnecting`, so a listener's connect() waits for it.
    const closing = Promise.resolve().then(async () => {
      await Promise.all(this.channels.map((c) => c.stop()));
      this.linkEpoch += 1;
      this.endNotifications();
      await this.tearDownLink();
      this.channels = [];
      this.closing = null;
      this.setState('disconnected');
    });
    this.closing = closing;
    this.setState('disconnecting');
    return closing;
  }

  /**
   * Disconnect the OS link and wait until it is really gone: the disconnect call has returned and its OS event has
   * arrived (or, if no link was ever established, a short grace period passed). That event is ours, never a loss.
   */
  private tearDownLink(): Promise<void> {
    if (this.teardown) return this.teardown;
    const done = new Promise<void>((resolve) => {
      let finished = false;
      let grace: unknown = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (grace !== null) this.scheduler.clearInterval(grace);
        this.ownDisconnect = null;
        resolve();
      };
      this.ownDisconnect = finish;
      void this.central
        .disconnect(this.options.peripheralId)
        .catch(() => undefined)
        .then(() => {
          if (!finished) grace = this.scheduler.setInterval(finish, DISCONNECT_EVENT_GRACE_MS);
        });
    });
    const teardown = done.then(() => {
      if (this.teardown === teardown) this.teardown = null;
    });
    this.teardown = teardown;
    return teardown;
  }

  /** Release the central's listeners. Call when this device is no longer the app's device. */
  dispose(): void {
    for (const unsubscribe of this.unsubscribeCentral) unsubscribe();
  }

  // ---- connecting ---------------------------------------------------------------------------------------------

  private async establish(epoch: number): Promise<BleDeviceChannel[]> {
    const id = this.options.peripheralId;
    const radio = await this.central.prepare();
    if (radio !== 'on') throw new ConnectFailure({ code: 'unavailable', message: RADIO_MESSAGES[radio] });
    this.checkStillConnecting(epoch);
    this.linkOpened = true;
    await this.bounded(this.central.connect(id), this.options.connectTimeoutMs ?? 10_000);
    this.checkStillConnecting(epoch);
    const characteristics = await this.central.discover(id);
    this.checkStillConnecting(epoch);
    checkGatt(characteristics);
    const bytes = await this.central.read(id, BLE_UUIDS.service, BLE_UUIDS.deviceInfo);
    this.checkStillConnecting(epoch);
    const decoded = decodePacket(bytes);
    if (!decoded.ok || decoded.packet.type !== 'device_info') {
      const why = decoded.ok ? 'it is not a device-info packet' : decoded.error.message;
      throw new ConnectFailure({ code: 'unavailable', message: `The sensor's device information is invalid: ${why}` });
    }
    const info = decoded.packet;
    if (info.status !== DeviceStatus.Ok) throw new ConnectFailure({ code: 'unavailable', message: describeStatus(info.status) });
    this.info = info;
    const infoNotifies = characteristics.some(
      (c) => c.service === BLE_UUIDS.service && c.characteristic === BLE_UUIDS.deviceInfo && c.properties.includes('notify'),
    );
    if (infoNotifies) {
      await this.central.startNotifications(id, BLE_UUIDS.service, BLE_UUIDS.deviceInfo, (value) => this.onDeviceInfo(value, epoch));
      this.checkStillConnecting(epoch);
    }
    return Array.from(
      { length: info.channelCount },
      (_, channel) => new BleDeviceChannel(this.sourceIdFor(channel), this, epoch),
    );
  }

  private bounded<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = this.scheduler.setInterval(() => {
        this.scheduler.clearInterval(timer);
        reject(new ConnectFailure({ code: 'timeout', message: `The sensor did not connect within ${Math.round(timeoutMs / 1000)} s` }));
      }, timeoutMs);
      promise.then(
        (value) => {
          this.scheduler.clearInterval(timer);
          resolve(value);
        },
        (error: unknown) => {
          this.scheduler.clearInterval(timer);
          reject(new ConnectFailure({ code: 'unavailable', message: `Could not connect to the sensor: ${messageOf(error)}` }));
        },
      );
    });
  }

  private checkStillConnecting(epoch: number): void {
    if (epoch !== this.linkEpoch || this.droppedWhileConnecting) {
      throw new ConnectFailure({ code: 'unavailable', message: 'The sensor disconnected while connecting' });
    }
  }

  // ---- link loss ----------------------------------------------------------------------------------------------

  private linkLost(message: string): void {
    if (this.closing) return; // our own disconnect
    if (this.state === 'connecting') {
      this.droppedWhileConnecting = true;
      return;
    }
    if (this.state !== 'connected' || this.dropping) return;
    let published!: () => void;
    this.lossPublished = new Promise<void>((resolve) => {
      published = resolve;
    });
    this.dropping = true;
    try {
      this.linkEpoch += 1;
      this.endNotifications();
      const error: SensorError = { code: 'connection_lost', message };
      for (const channel of this.channels) channel.interrupt(error);
      this.channels = [];
      this.fail({ code: 'connection_lost', message });
    } finally {
      this.dropping = false;
      this.lossPublished = null;
      published();
    }
  }

  // ---- streaming (used by channels) ---------------------------------------------------------------------------

  /** True while this connection (epoch) is up and not being torn down. */
  isLive(epoch: number): boolean {
    return epoch === this.linkEpoch && this.state === 'connected' && !this.dropping && this.closing === null;
  }

  /**
   * Enable sample notifications for this link if no channel has yet. Resolves once the device is streaming. An
   * earlier disable still in flight finishes first, so it can never switch off this new subscription.
   */
  ensureNotifications(epoch: number): Promise<void> {
    if (this.notifying && this.notifyingEpoch === epoch) return this.notifying;
    this.tracker.reset(); // nothing from an earlier subscription can mix into this one
    this.badPacketsInARow = 0;
    this.notifyingEpoch = epoch;
    const notifying = (this.notifyShutdown ?? Promise.resolve()).then(() => {
      if (!this.isLive(epoch)) throw new Error('the sensor is no longer connected');
      return this.central.startNotifications(this.options.peripheralId, BLE_UUIDS.service, BLE_UUIDS.samples, (value) =>
        this.onSamples(value, epoch),
      );
    });
    this.notifying = notifying;
    notifying.catch(() => {
      if (this.notifying === notifying) this.notifying = null;
    });
    this.startWatchdog();
    return notifying;
  }

  /**
   * Called when a channel stops or abandons a start: switch notifications off once no channel is streaming or
   * starting. The disable runs after any enable still in flight, and the next enable waits for it. Resolves once
   * any disable this call started has finished.
   */
  releaseNotificationsIfIdle(): Promise<void> {
    if (this.channels.some((c) => c.wantsData())) return Promise.resolve();
    const current = this.notifying;
    if (current && this.notifyingEpoch === this.linkEpoch && this.isLive(this.linkEpoch)) {
      const id = this.options.peripheralId;
      const shutdown: Promise<void> = current
        .catch(() => undefined)
        .then(() => this.central.stopNotifications(id, BLE_UUIDS.service, BLE_UUIDS.samples))
        .catch(() => undefined)
        .then(() => {
          if (this.notifyShutdown === shutdown) this.notifyShutdown = null;
        });
      this.notifyShutdown = shutdown;
    }
    this.notifying = null;
    this.tracker.reset();
    this.stopWatchdog();
    return this.notifyShutdown ?? Promise.resolve();
  }

  private endNotifications(): void {
    this.notifying = null;
    this.notifyShutdown = null; // the link is going away with its subscriptions
    this.tracker.reset();
    this.stopWatchdog();
  }

  private onSamples(value: Uint8Array, epoch: number): void {
    if (epoch !== this.notifyingEpoch || !this.isLive(epoch) || !this.notifying) return;
    const decoded = decodePacket(value);
    const packet: SamplePacket | null = decoded.ok && decoded.packet.type === 'samples' ? decoded.packet : null;
    const channel = packet ? this.channels[packet.channel] : undefined;
    if (!packet || !channel) {
      this.badPacketsInARow += 1;
      const why = !decoded.ok ? decoded.error.message : packet ? `channel ${packet.channel} does not exist` : 'not a sample packet';
      if (this.badPacketsInARow >= (this.options.maxConsecutiveBadPackets ?? 5)) {
        const error: SensorError = { code: 'invalid_data', message: `${this.badPacketsInARow} unreadable packets in a row (${why})` };
        for (const c of this.channels) c.failRun(error);
      }
      return;
    }
    this.badPacketsInARow = 0;
    const { samples, events } = this.tracker.accept(packet);
    for (const event of events) {
      if (event.kind === 'stream_restarted') {
        this.channels[event.channel]?.failRun({
          code: 'connection_lost',
          message: 'The sensor restarted its stream (it may have reset); the set cannot continue seamlessly',
        });
      }
    }
    channel.deliver(samples);
  }

  private onDeviceInfo(value: Uint8Array, epoch: number): void {
    if (!this.isLive(epoch)) return;
    const decoded = decodePacket(value);
    if (!decoded.ok || decoded.packet.type !== 'device_info') return;
    this.info = decoded.packet;
    if (decoded.packet.status !== DeviceStatus.Ok) {
      const error: SensorError = { code: 'unknown', message: describeStatus(decoded.packet.status) };
      for (const c of this.channels) c.failRun(error);
    }
  }

  private startWatchdog(): void {
    if (this.watchdog !== null) return;
    this.watchdog = this.scheduler.setInterval(() => {
      const limit = this.options.streamTimeoutMs ?? 1000;
      for (const channel of this.channels) channel.watchdogTick(WATCHDOG_TICK_MS, limit);
    }, WATCHDOG_TICK_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdog === null) return;
    this.scheduler.clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private sourceIdFor(channel: number): string {
    return `imu-${this.info?.deviceSerial ?? 'unidentified'}-ch${channel}`;
  }

  private fail(error: ConnectionError): void {
    if (this.state === 'failed') return;
    this.lastError = error;
    this.setState('failed');
  }

  /**
   * Delivered to every listener in order; a change made by a listener is published after the current one. A
   * listener that throws is reported and skipped: the others still get every change.
   */
  private setState(state: ConnectionState): void {
    if (state === this.state) return;
    if (state !== 'failed') this.lastError = null;
    this.state = state;
    this.unpublished.push(state);
    if (this.publishing) return;
    this.publishing = true;
    try {
      for (let next = this.unpublished.shift(); next !== undefined; next = this.unpublished.shift()) {
        for (const listener of this.listeners) deliver(() => listener(next));
      }
    } finally {
      this.publishing = false;
    }
  }
}

function deliver(call: () => void): void {
  try {
    call();
  } catch (error) {
    console.error('A listener failed; delivery to the other listeners continued.', error);
  }
}

function checkGatt(characteristics: readonly BleCharacteristicInfo[]): void {
  const find = (uuid: string) => characteristics.find((c) => c.service === BLE_UUIDS.service && c.characteristic === uuid);
  const samples = find(BLE_UUIDS.samples);
  const info = find(BLE_UUIDS.deviceInfo);
  if (!samples?.properties.includes('notify') || !info?.properties.includes('read')) {
    throw new ConnectFailure({
      code: 'unavailable',
      message: 'This device does not offer the sensor service (protocol v1): not a compatible sensor',
    });
  }
}

/** One IMU channel of a BLE sensor: an ordinary single-channel SensorSource, kind `ble`, provenance `sensor`. */
class BleDeviceChannel extends BaseSensorSource {
  readonly channel: DeviceChannel;
  private starting: Promise<void> | null = null;
  /** Bumped by stop(), interrupt() and failures, so a start still in flight knows it was overtaken. */
  private generation = 0;
  private idleMs = 0;

  constructor(
    sourceId: string,
    private readonly device: BleSensorDevice,
    private readonly epoch: number,
  ) {
    super(sourceId, 'ble', 'sensor');
    this.channel = { source_id: sourceId, source: this };
  }

  wantsData(): boolean {
    return this.getStatus() === 'streaming' || this.starting !== null;
  }

  start(): Promise<void> {
    if (this.getStatus() === 'streaming') return Promise.resolve();
    if (this.starting) return this.starting;
    if (!this.device.isLive(this.epoch)) {
      const error: SensorError = { code: 'start_failed', message: 'The sensor is not connected' };
      this.fail(error);
      return Promise.reject(new SensorStartError(error));
    }
    const generation = ++this.generation;
    const overtaken = () => {
      // A stop() cancelled this start (resolve, stay stopped) or a connection loss failed it (reject). Either way the
      // notifications it asked for may now be unused: release them unless another run wants them.
      void this.device.releaseNotificationsIfIdle();
      const error = this.getLastError();
      if (this.getStatus() === 'error' && error) throw new SensorStartError(error);
    };
    const attempt: Promise<void> = this.device.ensureNotifications(this.epoch).then(
      () => {
        if (this.starting === attempt) this.starting = null;
        if (generation !== this.generation) return overtaken();
        if (!this.device.isLive(this.epoch)) {
          const error: SensorError = { code: 'connection_lost', message: 'The sensor connection was lost while starting' };
          this.fail(error);
          throw new SensorStartError(error);
        }
        this.idleMs = 0;
        this.setStatus('streaming');
      },
      (error: unknown) => {
        if (this.starting === attempt) this.starting = null;
        if (generation !== this.generation) return overtaken();
        const reason: SensorError = { code: 'start_failed', message: `Could not start the sensor stream: ${messageOf(error)}` };
        this.fail(reason);
        void this.device.releaseNotificationsIfIdle();
        throw new SensorStartError(reason);
      },
    );
    this.starting = attempt;
    return attempt;
  }

  async stop(): Promise<void> {
    this.generation += 1;
    // Retire a start still waiting for notifications: it no longer owns them, and a later start() makes its own run.
    this.starting = null;
    if (this.getStatus() === 'streaming') this.setStatus('stopped');
    // A start() made meanwhile (e.g. by a `stopped` listener) keeps the notifications on. Otherwise this resolves once
    // the sensor has been told to stop streaming.
    await this.device.releaseNotificationsIfIdle();
  }

  /** Samples for this channel, in order. Delivery stops the moment the channel stops or fails, even mid-batch. */
  deliver(samples: readonly RawSensorSample[]): void {
    for (const sample of samples) {
      if (this.getStatus() !== 'streaming') return;
      this.idleMs = 0;
      this.emit(sample);
    }
  }

  /** The link dropped: fail with its reason if streaming or starting. */
  interrupt(error: SensorError): void {
    if (this.getStatus() !== 'streaming' && this.starting === null) return;
    this.generation += 1;
    this.starting = null;
    this.fail(error);
  }

  /** The device reported a problem with this run (bad data, restart, IMU error): end it with that reason. */
  failRun(error: SensorError): void {
    if (this.getStatus() !== 'streaming') return;
    this.generation += 1;
    this.fail(error);
    void this.device.releaseNotificationsIfIdle();
  }

  watchdogTick(tickMs: number, limitMs: number): void {
    if (this.getStatus() !== 'streaming') return;
    this.idleMs += tickMs;
    if (this.idleMs >= limitMs) {
      this.failRun({ code: 'stream_timeout', message: `No data from the sensor for ${(limitMs / 1000).toFixed(1)} s` });
    }
  }
}
