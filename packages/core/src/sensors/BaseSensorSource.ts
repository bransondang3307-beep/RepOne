import type { DataProvenance, Unsubscribe } from '../common/types';
import type { RawSensorSample, SensorSource, SensorSourceKind, SensorStatus } from './types';

/** Shared listener/status bookkeeping for SensorSource implementations. */
export abstract class BaseSensorSource implements SensorSource {
  private readonly sampleListeners = new Set<(sample: RawSensorSample) => void>();
  private readonly statusListeners = new Set<(status: SensorStatus) => void>();
  private status: SensorStatus = 'idle';

  protected constructor(
    readonly id: string,
    readonly kind: SensorSourceKind,
    readonly provenance: DataProvenance,
  ) {}

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  getStatus(): SensorStatus {
    return this.status;
  }

  subscribe(listener: (sample: RawSensorSample) => void): Unsubscribe {
    this.sampleListeners.add(listener);
    return () => this.sampleListeners.delete(listener);
  }

  subscribeStatus(listener: (status: SensorStatus) => void): Unsubscribe {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  protected emit(sample: RawSensorSample): void {
    for (const listener of this.sampleListeners) listener(sample);
  }

  protected setStatus(status: SensorStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
