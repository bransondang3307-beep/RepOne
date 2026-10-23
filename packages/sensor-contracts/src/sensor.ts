import type { DataProvenance, Unsubscribe, Vec3 } from './common';

/**
 * Raw sensor sample — mirrors the "Raw sensor sample" contract in
 * REPONE_SOURCE_OF_TRUTH.md §7. Field names (snake_case) and units are part of
 * the contract; do not rename or change units without an ADR.
 */
export interface RawSensorSample {
  /** Sensor/device-relative timestamp in milliseconds (NOT wall-clock epoch). */
  readonly timestamp_ms: number;
  readonly source_id: string;
  /** Linear acceleration, metres per second squared, sensor frame. */
  readonly accel_m_s2: Vec3;
  /** Angular velocity, radians per second, sensor frame. */
  readonly gyro_rad_s: Vec3;
  readonly quality_flags: readonly string[];
}

export type SensorSourceKind = 'simulated' | 'replay' | 'usb_serial' | 'ble';

/**
 * Lifecycle (ADR 0007): `idle` → `streaming` on start(); `streaming` → `stopped` on stop() or when a finite
 * stream ends; `streaming` → `error` when the source fails. `error` ends the run: no further samples, and
 * stop() leaves it in `error`. A later successful start() returns to `streaming` and clears the error.
 */
export type SensorStatus = 'idle' | 'streaming' | 'stopped' | 'error';

/** Why a source entered `error` (ADR 0007). Adapters map transport failures onto these codes. */
export type SensorErrorCode =
  /** Streaming could not begin (e.g. port or device unavailable). start() rejects. */
  | 'start_failed'
  /** The transport dropped while streaming (cable unplugged, link lost). */
  | 'connection_lost'
  /** No samples arrived within the source's own watchdog window. */
  | 'stream_timeout'
  /** Incoming data could not be decoded into valid samples. */
  | 'invalid_data'
  | 'unknown';

export interface SensorError {
  readonly code: SensorErrorCode;
  /** Diagnostic detail for logs and the UI. Never a measurement. */
  readonly message: string;
}

/** Rejection reason of a start() that could not begin streaming. */
export class SensorStartError extends Error {
  constructor(readonly sensorError: SensorError) {
    super(sensorError.message);
    this.name = 'SensorStartError';
  }
}

/**
 * The single hardware-abstraction boundary. Simulated, replayed, USB-serial and
 * (future) BLE sources all implement this interface; nothing downstream may
 * depend on which concrete source is in use.
 */
export interface SensorSource {
  readonly id: string;
  readonly kind: SensorSourceKind;
  /** Provenance stamped onto sessions recorded from this source. */
  readonly provenance: DataProvenance;
  getStatus(): SensorStatus;
  /** Why the source is in `error`; null in every other status. Set before the `error` status is published. */
  getLastError(): SensorError | null;
  /**
   * Begin streaming. A no-op while already streaming. Rejects with a `SensorStartError` if streaming cannot
   * begin; the status is then `error`.
   */
  start(): Promise<void>;
  /** Stop streaming. A no-op unless streaming: no status change, no event. */
  stop(): Promise<void>;
  /** Samples are delivered in non-decreasing timestamp order. */
  subscribe(listener: (sample: RawSensorSample) => void): Unsubscribe;
  /** Each status change is published once; no-op calls publish nothing. */
  subscribeStatus(listener: (status: SensorStatus) => void): Unsubscribe;
}
