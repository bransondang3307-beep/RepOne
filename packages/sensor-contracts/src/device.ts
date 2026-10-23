import type { Unsubscribe } from './common';
import type { SensorSource } from './sensor';

export type DeviceTransport = 'simulated' | 'usb_serial' | 'ble';

/**
 * Connection lifecycle (ADR 0007 §4): `disconnected → connecting → connected → disconnecting → disconnected`.
 * A refused connect or a lost link goes to `failed` with a reason; connect() may retry from there.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'failed';

/** Why a connection is `failed` (ADR 0007 §4). Adapters map transport failures onto these codes. */
export type ConnectionErrorCode =
  /** The device or port was not found, or refused the connection. */
  | 'unavailable'
  /** Connecting did not finish within the adapter's limit. */
  | 'timeout'
  /** The link dropped while connected. Every streaming channel fails with `connection_lost` too. */
  | 'connection_lost'
  | 'unknown';

export interface ConnectionError {
  readonly code: ConnectionErrorCode;
  /** Diagnostic detail for logs and the UI. */
  readonly message: string;
}

/** Rejection reason of a connect() that failed. */
export class DeviceConnectError extends Error {
  constructor(readonly connectionError: ConnectionError) {
    super(connectionError.message);
    this.name = 'DeviceConnectError';
  }
}

/**
 * One channel of a device: one physical IMU (ADR 0007 §2). Its source is an ordinary single-channel
 * SensorSource whose samples all carry this `source_id`.
 */
export interface DeviceChannel {
  readonly source_id: string;
  readonly source: SensorSource;
}

/**
 * A sensor device the app connects to: simulated now; USB-serial or BLE adapters later. It owns the
 * connection; recording still goes through each channel's SensorSource.
 */
export interface DeviceConnection {
  /** Stable identifier of the physical device. Not a display name, and never a product name (ADR 0006). */
  readonly deviceId: string;
  readonly transport: DeviceTransport;
  getState(): ConnectionState;
  /** Why the connection is `failed`; null in every other state. Set before `failed` is published. */
  getLastError(): ConnectionError | null;
  /**
   * Each state change is published once, to every listener, in the order the changes happen; no-op calls publish
   * nothing. A change made by a listener is published after the current one; getState() returns the latest. A
   * listener that throws is reported and skipped; it never stops delivery to the others.
   */
  subscribeState(listener: (state: ConnectionState) => void): Unsubscribe;
  /**
   * Connect. Resolves at once when already connected; while connecting, returns the pending attempt. That
   * attempt exists before `connecting` is published, so connect()/disconnect() called from a state listener see
   * it. Rejects with a `DeviceConnectError` if the attempt fails; the state is then `failed`. Called while a
   * connection loss is being published (the device still reads `connected`), it waits until `failed` has been
   * published and then makes a real attempt.
   */
  connect(): Promise<void>;
  /**
   * Disconnect: waits for a pending connect, stops every channel, then `disconnected`. The disconnect exists
   * before `disconnecting` is published, so a connect() from a state listener waits for it. A no-op when not
   * connected (including `failed`; connect() is the way out of `failed`). Called while a connection loss is being
   * published, it waits for `failed` and is then a no-op.
   */
  disconnect(): Promise<void>;
  /**
   * The channels while `connected`; empty otherwise. A channel's source cannot start unless the device is
   * connected (`SensorStartError`, code `start_failed`). If the link drops, every streaming channel, and every
   * channel whose start() is still pending (that start() rejects), fails with `connection_lost` before the device
   * publishes `failed`. From the moment the link drops the device counts as not connected, so a channel restart
   * attempted from a failure listener is refused. A failed or stopped channel delivers nothing more, even
   * mid-batch.
   */
  getChannels(): readonly DeviceChannel[];
}
