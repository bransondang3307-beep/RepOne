import type { Scheduler, Unsubscribe } from '@repone/sensor-contracts';
import { BLE_UUIDS, DeviceStatus, encodeDeviceInfo, encodeSamplePacket, type WireImuSample } from '@repone/sensor-protocol';
import type { BleCentral, BleCharacteristicInfo, BlePeripheralSeen, BleRadioState } from '../BleCentral';

/**
 * A fake BLE central with SYNTHETIC peripherals, for tests only. It stands in for the native module, not for a sensor:
 * passing tests here show the adapter's state handling, never radio connectivity. Peripherals stream real protocol
 * packets (built with @repone/sensor-protocol) on the injected scheduler.
 */
export interface FakePeripheralOptions {
  readonly id?: string;
  readonly name?: string | null;
  readonly serial?: string;
  readonly channelCount?: number;
  readonly rateHz?: number;
  /** Batch interval, ms (100 like the firmware's latency bound). */
  readonly flushMs?: number;
  /**
   * Total connect time, ms, counted from the start of the adapter's attempt (its prepare() call, as from a user's
   * tap); `null` = never (an iOS connect that hangs). Default 0.
   */
  readonly connectDelayMs?: number | null;
  readonly refuseConnect?: boolean;
  /** Advertise without the sensor service's characteristics (a different BLE device). */
  readonly incompatibleGatt?: boolean;
  readonly infoStatus?: number;
  /** Device-info bytes to return instead of a valid packet. */
  readonly infoBytes?: Uint8Array;
  readonly failStartNotifications?: boolean;
  /** Send garbage instead of sample packets after this many packets. */
  readonly corruptAfterPackets?: number;
  /** Stop sending (silently) after this many packets. */
  readonly silentAfterPackets?: number;
  /** Notify device-info status 2 (IMU read failed) after this many packets and stop streaming. */
  readonly imuFailsAfterPackets?: number;
  /** The first device-info read fails (a flaky link); later reads succeed. */
  readonly failInfoReadOnce?: boolean;
}

/** Native operations a test can hold mid-flight, to reproduce orderings the OS can produce. */
export type HoldableOperation = 'prepare' | 'disconnect' | 'startNotifications' | 'stopNotifications';

interface Stream {
  timer: unknown;
  streamId: number;
  sequence: number[];
  deviceTimeMs: number;
  packets: number;
}

export class FakePeripheral {
  readonly id: string;
  connected = false;
  /** Settles when the current attempt's connect time has elapsed (see `connectDelayMs`). */
  ready: Promise<void> = Promise.resolve();
  streamsStarted = 0;
  infoReadFailed = false;
  private stream: Stream | null = null;
  private infoListener: ((value: Uint8Array) => void) | null = null;
  private onValue: ((value: Uint8Array) => void) | null = null;

  constructor(readonly options: FakePeripheralOptions = {}) {
    this.id = options.id ?? 'peripheral-1';
  }

  get serial(): string {
    return this.options.serial ?? '0000a1b2c3d4e5f6';
  }

  infoPacket(status: number = this.options.infoStatus ?? DeviceStatus.Ok): Uint8Array {
    return (
      this.options.infoBytes ??
      encodeDeviceInfo({
        deviceSerial: this.serial,
        channelCount: this.options.channelCount ?? 1,
        accelRange: 0,
        gyroRange: 0,
        nominalRateHz: this.options.rateHz ?? 50,
        firmwareVersion: { major: 0, minor: 1 },
        status,
      })
    );
  }

  setInfoListener(listener: ((value: Uint8Array) => void) | null): void {
    this.infoListener = listener;
  }

  startStream(scheduler: Scheduler, onValue: (value: Uint8Array) => void): void {
    this.stopStream(scheduler);
    this.onValue = onValue;
    this.streamsStarted += 1;
    const channels = this.options.channelCount ?? 1;
    const flushMs = this.options.flushMs ?? 100;
    const periodMs = 1000 / (this.options.rateHz ?? 50);
    const stream: Stream = {
      timer: null,
      streamId: 0x1000 + this.streamsStarted,
      sequence: Array(channels).fill(0),
      deviceTimeMs: 5000,
      packets: 0,
    };
    stream.timer = scheduler.setInterval(() => {
      const o = this.options;
      if (o.silentAfterPackets !== undefined && stream.packets >= o.silentAfterPackets) return;
      if (o.imuFailsAfterPackets !== undefined && stream.packets >= o.imuFailsAfterPackets) {
        this.stopStream(scheduler);
        this.infoListener?.(this.infoPacket(DeviceStatus.ImuReadFailed));
        return;
      }
      const count = Math.max(1, Math.round(flushMs / periodMs));
      for (let channel = 0; channel < channels; channel++) {
        if (o.corruptAfterPackets !== undefined && stream.packets >= o.corruptAfterPackets) {
          onValue(Uint8Array.from([0x01, 0x01, 0xff, 0xff]));
          continue;
        }
        const samples: WireImuSample[] = Array.from({ length: count }, (_, i) => ({
          deviceTimeMs: stream.deviceTimeMs + Math.round(i * periodMs),
          accel: [10 * channel, -20, 16384],
          gyro: [131, 0, -131 * channel],
        }));
        onValue(
          encodeSamplePacket({
            streamStart: stream.packets === 0,
            deviceOverflow: false,
            accelRange: 0,
            gyroRange: 0,
            channel,
            streamId: stream.streamId,
            firstSequence: stream.sequence[channel]!,
            samples,
          }),
        );
        stream.sequence[channel] = (stream.sequence[channel]! + count) % 0x10000;
      }
      stream.deviceTimeMs += Math.round(count * periodMs);
      stream.packets += 1;
    }, flushMs);
    this.stream = stream;
  }

  /** The sensor restarts streaming on the same subscription (e.g. it rebooted): new stream id, sequence 0. */
  rebootStream(scheduler: Scheduler): void {
    if (!this.onValue) throw new Error('not streaming');
    this.startStream(scheduler, this.onValue);
  }

  stopStream(scheduler: Scheduler): void {
    if (this.stream) scheduler.clearInterval(this.stream.timer);
    this.stream = null;
  }

  get streaming(): boolean {
    return this.stream !== null;
  }
}

export class FakeBleCentral implements BleCentral {
  radio: BleRadioState = 'on';
  prepareCalls = 0;
  private readonly disconnectListeners = new Set<(id: string) => void>();
  private readonly radioListeners = new Set<(state: BleRadioState) => void>();
  private scanning: ((p: BlePeripheralSeen) => void) | null = null;
  scanFilter: readonly string[] = [];
  private readonly holds = new Map<HoldableOperation, Promise<void>>();

  /** Hold every call of `operation` (after it is made) until the returned release() runs. */
  hold(operation: HoldableOperation): () => void {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.holds.set(operation, gate);
    return () => {
      if (this.holds.get(operation) === gate) this.holds.delete(operation);
      release();
    };
  }

  private held(operation: HoldableOperation): Promise<void> {
    return this.holds.get(operation) ?? Promise.resolve();
  }

  constructor(
    private readonly scheduler: Scheduler,
    readonly peripherals: FakePeripheral[] = [new FakePeripheral()],
  ) {}

  get listenerCounts() {
    return { disconnect: this.disconnectListeners.size, radio: this.radioListeners.size };
  }

  peripheral(id: string): FakePeripheral {
    const p = this.peripherals.find((x) => x.id === id);
    if (!p) throw new Error(`no fake peripheral ${id}`);
    return p;
  }

  /** The link drops (out of range, sensor powered off): the OS reports a disconnect. */
  dropLink(id: string): void {
    const p = this.peripheral(id);
    p.connected = false;
    p.stopStream(this.scheduler);
    for (const listener of [...this.disconnectListeners]) listener(id);
  }

  setRadio(state: BleRadioState): void {
    this.radio = state;
    if (state !== 'on') for (const p of this.peripherals) p.stopStream(this.scheduler);
    for (const listener of [...this.radioListeners]) listener(state);
  }

  prepare(): Promise<BleRadioState> {
    this.prepareCalls += 1;
    // Each attempt's connect time starts now, synchronously, like the simulated device's delay.
    for (const p of this.peripherals) {
      const delay = p.options.connectDelayMs;
      if (typeof delay === 'number' && delay > 0) {
        p.ready = new Promise<void>((resolve) => {
          const timer = this.scheduler.setInterval(() => {
            this.scheduler.clearInterval(timer);
            resolve();
          }, delay);
        });
      }
    }
    return this.held('prepare').then(() => this.radio);
  }

  subscribeRadioState(listener: (state: BleRadioState) => void): Unsubscribe {
    this.radioListeners.add(listener);
    return () => this.radioListeners.delete(listener);
  }

  async startScan(serviceUuids: readonly string[], onSeen: (peripheral: BlePeripheralSeen) => void): Promise<void> {
    this.scanFilter = serviceUuids;
    this.scanning = onSeen;
    for (const p of this.peripherals) {
      if (!p.options.incompatibleGatt) onSeen({ id: p.id, name: p.options.name ?? null, rssi: -60 });
    }
  }

  async stopScan(): Promise<void> {
    this.scanning = null;
  }

  get isScanning(): boolean {
    return this.scanning !== null;
  }

  connect(id: string): Promise<void> {
    const p = this.peripheral(id);
    if (p.options.refuseConnect) return Promise.reject(new Error('Peripheral refused the connection'));
    const delay = p.options.connectDelayMs === undefined ? 0 : p.options.connectDelayMs;
    if (delay === null) return new Promise<void>(() => undefined);
    return p.ready.then(() => {
      p.connected = true;
    });
  }

  async disconnect(id: string): Promise<void> {
    await this.held('disconnect');
    const p = this.peripheral(id);
    const was = p.connected;
    p.connected = false;
    p.stopStream(this.scheduler);
    p.setInfoListener(null);
    if (was) for (const listener of [...this.disconnectListeners]) listener(id);
  }

  subscribeDisconnect(listener: (id: string) => void): Unsubscribe {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  async discover(id: string): Promise<readonly BleCharacteristicInfo[]> {
    const p = this.peripheral(id);
    if (p.options.incompatibleGatt) {
      return [{ service: '0000180f-0000-1000-8000-00805f9b34fb', characteristic: '00002a19-0000-1000-8000-00805f9b34fb', properties: ['read'] }];
    }
    return [
      { service: BLE_UUIDS.service, characteristic: BLE_UUIDS.samples, properties: ['notify'] },
      { service: BLE_UUIDS.service, characteristic: BLE_UUIDS.deviceInfo, properties: ['read', 'notify'] },
    ];
  }

  async read(id: string, _service: string, characteristic: string): Promise<Uint8Array> {
    const p = this.peripheral(id);
    if (characteristic !== BLE_UUIDS.deviceInfo) throw new Error('not readable');
    if (p.options.failInfoReadOnce && !p.infoReadFailed) {
      p.infoReadFailed = true;
      throw new Error('Reading the characteristic failed');
    }
    return p.infoPacket();
  }

  async startNotifications(id: string, _service: string, characteristic: string, onValue: (value: Uint8Array) => void): Promise<void> {
    const p = this.peripheral(id);
    if (!p.connected) throw new Error('not connected');
    if (characteristic === BLE_UUIDS.deviceInfo) {
      p.setInfoListener(onValue);
      return;
    }
    await this.held('startNotifications');
    if (!p.connected) throw new Error('not connected');
    if (p.options.failStartNotifications) throw new Error('Writing the notification descriptor failed');
    p.startStream(this.scheduler, onValue);
  }

  async stopNotifications(id: string, _service: string, characteristic: string): Promise<void> {
    await this.held('stopNotifications');
    if (characteristic === BLE_UUIDS.samples) this.peripheral(id).stopStream(this.scheduler);
  }
}
