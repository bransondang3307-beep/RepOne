import { systemScheduler, type Scheduler } from '../common';
import { MotionSynthesizer, type MotionScript, type SimulationOptions } from './motion';
import { BaseSensorSource } from '../BaseSensorSource';
import { SensorStartError, type SensorError, type SensorErrorCode } from '../sensor';

/** A scripted, deterministic failure for exercising error handling with synthetic data. */
export interface SimulatedFault {
  /** Fail once this many samples of a run have been delivered. `0` makes start() itself fail. */
  readonly afterSamples: number;
  readonly code: SensorErrorCode;
  /** Default: `Simulated fault: <code>`. */
  readonly message?: string;
}

export interface SimulatedSensorSourceDeps {
  readonly script: MotionScript;
  readonly simulation: SimulationOptions;
  readonly scheduler?: Scheduler;
  /** How often samples are delivered in batches, ms. Default 100. */
  readonly tickMs?: number;
  /** Optional scripted failure, applied to every run. */
  readonly fault?: SimulatedFault;
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
    const { fault } = this.deps;
    if (fault && fault.afterSamples <= 0) {
      const error = faultError(fault);
      this.fail(error);
      throw new SensorStartError(error);
    }
    // A fresh synthesiser per start keeps each run reproducible from the seed.
    const synth = new MotionSynthesizer(this.deps.script, this.deps.simulation);
    const samplesPerTick = Math.max(1, Math.round((this.deps.simulation.sampleRateHz * this.tickMs) / 1000));
    let delivered = 0;
    this.setStatus('streaming');
    this.handle = this.scheduler.setInterval(() => {
      for (let i = 0; i < samplesPerTick; i++) {
        if (fault && delivered >= fault.afterSamples) {
          this.release();
          this.fail(faultError(fault));
          return;
        }
        const sample = synth.next();
        if (sample === undefined) {
          void this.stop();
          return;
        }
        if (sample) {
          this.emit(sample);
          delivered += 1;
        }
      }
    }, this.tickMs);
  }

  async stop(): Promise<void> {
    this.release();
    if (this.getStatus() === 'streaming') this.setStatus('stopped');
  }

  private release(): void {
    if (this.handle !== null) {
      this.scheduler.clearInterval(this.handle);
      this.handle = null;
    }
  }
}

function faultError(fault: SimulatedFault): SensorError {
  return { code: fault.code, message: fault.message ?? `Simulated fault: ${fault.code}` };
}
