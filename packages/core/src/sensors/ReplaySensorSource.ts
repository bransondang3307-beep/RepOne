import { systemScheduler, type DataProvenance, type Scheduler } from '../common/types';
import { BaseSensorSource } from './BaseSensorSource';
import type { RawSensorSample } from './types';

export interface ReplaySensorSourceDeps {
  readonly id: string;
  readonly samples: readonly RawSensorSample[];
  /**
   * `immediate` emits every sample synchronously inside start() — use for
   * reproducible offline evaluation. `realtime` paces samples by their timestamps.
   */
  readonly mode?: 'immediate' | 'realtime';
  readonly scheduler?: Scheduler;
  readonly tickMs?: number;
  /** Provenance of the recording being replayed. Default `replay`. */
  readonly provenance?: DataProvenance;
}

/** Replays a previously recorded (or synthetic) trace through the SensorSource contract. */
export class ReplaySensorSource extends BaseSensorSource {
  private readonly scheduler: Scheduler;
  private handle: unknown = null;

  constructor(private readonly deps: ReplaySensorSourceDeps) {
    super(deps.id, 'replay', deps.provenance ?? 'replay');
    this.scheduler = deps.scheduler ?? systemScheduler;
  }

  async start(): Promise<void> {
    if (this.getStatus() === 'streaming') return;
    const { samples } = this.deps;
    this.setStatus('streaming');

    if ((this.deps.mode ?? 'immediate') === 'immediate') {
      for (const sample of samples) this.emit(sample);
      this.setStatus('stopped');
      return;
    }

    const tickMs = this.deps.tickMs ?? 100;
    const origin = samples[0]?.timestamp_ms ?? 0;
    let cursor = 0;
    let elapsedMs = 0;
    this.handle = this.scheduler.setInterval(() => {
      elapsedMs += tickMs;
      while (cursor < samples.length && samples[cursor]!.timestamp_ms - origin < elapsedMs) {
        this.emit(samples[cursor]!);
        cursor += 1;
      }
      if (cursor >= samples.length) void this.stop();
    }, tickMs);
  }

  async stop(): Promise<void> {
    if (this.handle !== null) {
      this.scheduler.clearInterval(this.handle);
      this.handle = null;
    }
    if (this.getStatus() === 'streaming') this.setStatus('stopped');
  }
}
