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

export type SensorStatus = 'idle' | 'streaming' | 'stopped' | 'error';

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
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Samples are delivered in non-decreasing timestamp order. */
  subscribe(listener: (sample: RawSensorSample) => void): Unsubscribe;
  subscribeStatus(listener: (status: SensorStatus) => void): Unsubscribe;
}
