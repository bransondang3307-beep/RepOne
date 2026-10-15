import { systemScheduler, type Scheduler } from '../common/types';
import { MotionSynthesizer, type MotionScript, type SimulationOptions } from '../simulation/motion';
import { BaseSensorSource } from './BaseSensorSource';

export interface SimulatedSensorSourceDeps {
  readonly script: MotionScript;
  readonly simulation: SimulationOptions;
  readonly scheduler?: Scheduler;
  /** How often samples are delivered in batches, ms. Default 100. */
  readonly tickMs?: number;
}

/**
 * Generates synthetic IMU samples live from a motion script. Every sample is
 * flagged `synthetic` and sessions are stamped with provenance `simulated`.
 */
export class SimulatedSensorSource extends BaseSensorSource {
  private readonly scheduler: Scheduler;
  private readonly tickMs: number;
  private handle: unknown = null;

  constructor(private readonly deps: SimulatedSensorSourceDeps) {
    super(deps.simulation.sourceId, 'simulated', 'simulated');
    this.scheduler = deps.scheduler ?? systemScheduler;
    this.tickMs = deps.tickMs ?? 100;
  }

  async start(): Promise<void> {
    if (this.handle !== null) return;
    // A fresh synthesiser per start keeps each run reproducible from the seed.
    const synth = new MotionSynthesizer(this.deps.script, this.deps.simulation);
    const samplesPerTick = Math.max(1, Math.round((this.deps.simulation.sampleRateHz * this.tickMs) / 1000));
    this.setStatus('streaming');
    this.handle = this.scheduler.setInterval(() => {
      for (let i = 0; i < samplesPerTick; i++) {
        const sample = synth.next();
        if (sample === undefined) {
          void this.stop();
          return;
        }
        if (sample) this.emit(sample);
      }
    }, this.tickMs);
  }

  async stop(): Promise<void> {
    if (this.handle !== null) {
      this.scheduler.clearInterval(this.handle);
      this.handle = null;
    }
    if (this.getStatus() === 'streaming') this.setStatus('stopped');
  }
}
