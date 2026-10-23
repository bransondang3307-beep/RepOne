import type { DataProvenance, Unsubscribe } from './common';
import type { RawSensorSample, SensorError, SensorSource, SensorSourceKind, SensorStatus } from './sensor';

/** Shared listener/status/error bookkeeping for SensorSource implementations. */
export abstract class BaseSensorSource implements SensorSource {
  private readonly sampleListeners = new Set<(sample: RawSensorSample) => void>();
  private readonly statusListeners = new Set<(status: SensorStatus) => void>();
  private status: SensorStatus = 'idle';
  private lastError: SensorError | null = null;
  private readonly unpublished: SensorStatus[] = [];
  private publishing = false;

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

  getLastError(): SensorError | null {
    return this.lastError;
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

  /**
   * Enter `error` with a reason. The subclass releases its own timers/transport first, so nothing is emitted
   * afterwards. The first failure of a run wins; later ones are ignored.
   */
  protected fail(error: SensorError): void {
    if (this.status === 'error') return;
    this.lastError = error;
    this.setStatus('error');
  }

  /**
   * Changes are delivered to every listener in the order they happen. A change made by a listener while one is
   * being delivered is published after that one has reached every listener; getStatus() always returns the latest.
   */
  protected setStatus(status: SensorStatus): void {
    if (status === this.status) return;
    if (status !== 'error') this.lastError = null;
    this.status = status;
    this.unpublished.push(status);
    if (this.publishing) return;
    this.publishing = true;
    try {
      for (let next = this.unpublished.shift(); next !== undefined; next = this.unpublished.shift()) {
        for (const listener of this.statusListeners) listener(next);
      }
    } finally {
      this.publishing = false;
    }
  }
}
