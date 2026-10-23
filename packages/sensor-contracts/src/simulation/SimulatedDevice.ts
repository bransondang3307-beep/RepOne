import { systemScheduler, type Scheduler, type Unsubscribe } from '../common';
import { BaseSensorSource } from '../BaseSensorSource';
import {
  DeviceConnectError,
  type ConnectionError,
  type ConnectionErrorCode,
  type ConnectionState,
  type DeviceChannel,
  type DeviceConnection,
} from '../device';
import { SensorStartError, type SensorError } from '../sensor';
import type { MotionScript, SimulationOptions } from './motion';
import { SimulatedSensorSource, type SimulatedFault } from './SimulatedSensorSource';

/** One synthetic IMU on the device. `simulation.sourceId` is the channel's `source_id`. */
export interface SimulatedChannelSpec {
  readonly script: MotionScript;
  readonly simulation: SimulationOptions;
  /** A failure of this channel only; the device stays connected. */
  readonly fault?: SimulatedFault;
}

export interface SimulatedDeviceOptions {
  readonly deviceId: string;
  readonly channels: readonly SimulatedChannelSpec[];
  readonly scheduler?: Scheduler;
  /** Sample batching interval of every channel, ms. Default 100. */
  readonly tickMs?: number;
  /** Time connect() takes, ms. `0` (default) connects synchronously inside connect(). */
  readonly connectDelayMs?: number;
  /** connect() fails with this reason: on the first `attempts` tries, or on every try if omitted. */
  readonly refuseConnect?: { readonly code: ConnectionErrorCode; readonly message?: string; readonly attempts?: number };
}

/**
 * A simulated multi-channel sensor device (ADR 0007 §4). Everything it produces is synthetic: samples are
 * flagged `synthetic`, sessions get provenance `simulated`, and failure messages say "Simulated".
 */
export class SimulatedDevice implements DeviceConnection {
  readonly transport = 'simulated' as const;
  readonly deviceId: string;
  private readonly scheduler: Scheduler;
  private readonly channels: readonly SimulatedDeviceChannel[];
  private readonly listeners = new Set<(state: ConnectionState) => void>();
  private state: ConnectionState = 'disconnected';
  private lastError: ConnectionError | null = null;
  private pending: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  /** True while a connection loss is being published: the link is already gone, though not yet `failed`. */
  private dropping = false;
  private attempts = 0;
  private readonly unpublished: ConnectionState[] = [];
  private publishing = false;

  constructor(private readonly options: SimulatedDeviceOptions) {
    if (options.channels.length === 0) throw new Error('A simulated device needs at least one channel');
    const ids = options.channels.map((c) => c.simulation.sourceId);
    if (new Set(ids).size !== ids.length) throw new Error(`Channel source_ids must be unique: ${ids.join(', ')}`);
    this.deviceId = options.deviceId;
    this.scheduler = options.scheduler ?? systemScheduler;
    this.channels = options.channels.map(
      (spec) =>
        new SimulatedDeviceChannel(spec, this.scheduler, options.tickMs, () => this.state === 'connected' && !this.dropping),
    );
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
    return this.state === 'connected' ? this.channels.map((c) => c.channel) : [];
  }

  connect(): Promise<void> {
    if (this.state === 'connected') return Promise.resolve();
    if (this.pending) return this.pending;
    if (this.closing) return this.closing.then(() => this.connect());
    this.attempts += 1;
    let settle!: { resolve: () => void; reject: (error: unknown) => void };
    const pending = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    const finish = () => {
      this.pending = null;
      try {
        this.finishConnect();
        settle.resolve();
      } catch (error) {
        settle.reject(error);
      }
    };
    // Install the attempt before publishing `connecting`, so a listener's connect()/disconnect() sees and waits for it.
    this.pending = pending;
    this.setState('connecting');
    const delayMs = this.options.connectDelayMs ?? 0;
    if (delayMs <= 0) {
      finish();
    } else {
      const handle = this.scheduler.setInterval(() => {
        this.scheduler.clearInterval(handle);
        finish();
      }, delayMs);
    }
    return pending;
  }

  async disconnect(): Promise<void> {
    if (this.pending) await this.pending.catch(() => undefined);
    if (this.closing) return this.closing;
    if (this.state !== 'connected') return;
    // Install the disconnect before publishing `disconnecting`, so a listener's connect() waits for it.
    const closing = Promise.resolve().then(async () => {
      await Promise.all(this.channels.map((c) => c.stop()));
      this.closing = null;
      this.setState('disconnected');
    });
    this.closing = closing;
    this.setState('disconnecting');
    return closing;
  }

  /** Drop the link (test and demo hook): every streaming channel fails, then the device is `failed`. */
  simulateConnectionLoss(message = 'Simulated connection loss'): void {
    if (this.state !== 'connected' || this.dropping) return;
    // From here on the link is gone: a channel restart attempted from a failure listener is refused.
    this.dropping = true;
    try {
      for (const channel of this.channels) channel.interrupt({ code: 'connection_lost', message });
      this.fail({ code: 'connection_lost', message });
    } finally {
      this.dropping = false;
    }
  }

  private finishConnect(): void {
    const refuse = this.options.refuseConnect;
    if (refuse && this.attempts <= (refuse.attempts ?? Number.POSITIVE_INFINITY)) {
      const error: ConnectionError = { code: refuse.code, message: refuse.message ?? `Simulated connect failure: ${refuse.code}` };
      this.fail(error);
      throw new DeviceConnectError(error);
    }
    this.setState('connected');
  }

  private fail(error: ConnectionError): void {
    if (this.state === 'failed') return;
    this.lastError = error;
    this.setState('failed');
  }

  /** Delivered to every listener in order; a change made by a listener is published after the current one. */
  private setState(state: ConnectionState): void {
    if (state === this.state) return;
    if (state !== 'failed') this.lastError = null;
    this.state = state;
    this.unpublished.push(state);
    if (this.publishing) return;
    this.publishing = true;
    try {
      for (let next = this.unpublished.shift(); next !== undefined; next = this.unpublished.shift()) {
        for (const listener of this.listeners) listener(next);
      }
    } finally {
      this.publishing = false;
    }
  }
}

/** A device channel's SensorSource: streams only while the device is connected. */
class SimulatedDeviceChannel extends BaseSensorSource {
  readonly channel: DeviceChannel;
  private readonly inner: SimulatedSensorSource;
  private starting: Promise<void> | null = null;
  /** Bumped by stop() and interrupt() so a start still in flight knows it was overtaken. */
  private generation = 0;

  constructor(
    spec: SimulatedChannelSpec,
    scheduler: Scheduler,
    tickMs: number | undefined,
    private readonly isConnected: () => boolean,
  ) {
    super(spec.simulation.sourceId, 'simulated', 'simulated');
    this.inner = new SimulatedSensorSource({ script: spec.script, simulation: spec.simulation, scheduler, tickMs, fault: spec.fault });
    // Only a streaming channel forwards samples: nothing reaches listeners after a stop or a failure.
    this.inner.subscribe((sample) => {
      if (this.getStatus() === 'streaming') this.emit(sample);
    });
    this.inner.subscribeStatus((status) => {
      if (this.getStatus() !== 'streaming') return;
      if (status === 'stopped') this.setStatus('stopped');
      else if (status === 'error') this.fail(this.inner.getLastError() ?? { code: 'unknown', message: 'Simulated channel error' });
    });
    this.channel = { source_id: this.id, source: this };
  }

  start(): Promise<void> {
    if (this.getStatus() === 'streaming') return Promise.resolve();
    if (this.starting) return this.starting;
    if (!this.isConnected()) {
      const error: SensorError = { code: 'start_failed', message: 'The device is not connected' };
      this.fail(error);
      return Promise.reject(new SensorStartError(error));
    }
    const generation = ++this.generation;
    const overtaken = () => {
      // A connection loss failed this start (reject); a stop() cancelled it (resolve, stay stopped).
      const error = this.getLastError();
      if (this.getStatus() === 'error' && error) throw new SensorStartError(error);
    };
    this.starting = this.inner.start().then(
      () => {
        this.starting = null;
        if (generation !== this.generation) return overtaken();
        if (!this.isConnected()) {
          // The link went away while this start was in flight: never publish `streaming` on a lost device.
          void this.inner.stop();
          const error: SensorError = { code: 'connection_lost', message: 'The device connection was lost while starting' };
          this.fail(error);
          throw new SensorStartError(error);
        }
        this.setStatus('streaming');
      },
      (error: unknown) => {
        this.starting = null;
        if (generation !== this.generation) return overtaken();
        const reason = (error as SensorStartError).sensorError ?? { code: 'start_failed', message: String(error) };
        this.fail(reason);
        throw new SensorStartError(reason);
      },
    );
    return this.starting;
  }

  async stop(): Promise<void> {
    const generation = ++this.generation;
    await this.inner.stop();
    // A start() made meanwhile (e.g. by a `stopped` listener) owns the channel now: never overwrite that newer run.
    if (generation === this.generation && this.getStatus() === 'streaming') this.setStatus('stopped');
  }

  /** The device lost its link: fail with its reason if streaming or starting. */
  interrupt(error: SensorError): void {
    if (this.getStatus() !== 'streaming' && this.starting === null) return;
    this.generation += 1;
    this.fail(error);
    void this.inner.stop();
  }
}
