import {
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SimulatedSensorSource,
  type RawSensorSample,
  type SensorSource,
  type SensorStatus,
} from '../src';
import { BASE_SIMULATION, labelledSetTrace } from './helpers/fixtures';
import { ManualScheduler } from './helpers/ManualScheduler';

interface Harness {
  source: SensorSource;
  /** Drive the source forward in time (no-op for immediate sources). */
  advance(ms: number): void;
}

const implementations: Array<[string, () => Harness]> = [
  [
    'SimulatedSensorSource',
    () => {
      const scheduler = new ManualScheduler();
      const source = new SimulatedSensorSource({ script: LABELLED_SET_SCRIPT, simulation: BASE_SIMULATION, scheduler });
      return { source, advance: (ms) => scheduler.advance(ms) };
    },
  ],
  [
    'ReplaySensorSource (realtime)',
    () => {
      const scheduler = new ManualScheduler();
      const source = new ReplaySensorSource({ id: 'replay-1', samples: labelledSetTrace().samples, mode: 'realtime', scheduler });
      return { source, advance: (ms) => scheduler.advance(ms) };
    },
  ],
];

// Shared contract: every SensorSource implementation must pass this suite.
describe.each(implementations)('SensorSource contract: %s', (_name, create) => {
  it('starts idle, streams ordered samples, and stops cleanly', async () => {
    const { source, advance } = create();
    const statuses: SensorStatus[] = [];
    const samples: RawSensorSample[] = [];
    source.subscribeStatus((s) => statuses.push(s));
    source.subscribe((s) => samples.push(s));

    expect(source.getStatus()).toBe('idle');
    await source.start();
    advance(1000);
    expect(samples.length).toBeGreaterThanOrEqual(45);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.timestamp_ms).toBeGreaterThanOrEqual(samples[i - 1]!.timestamp_ms);
    }
    await source.stop();
    const count = samples.length;
    advance(1000);
    expect(samples).toHaveLength(count);
    expect(statuses).toEqual(['streaming', 'stopped']);
  });

  it('stops delivering to unsubscribed listeners', async () => {
    const { source, advance } = create();
    const listener = jest.fn();
    const unsubscribe = source.subscribe(listener);
    await source.start();
    advance(200);
    unsubscribe();
    const calls = listener.mock.calls.length;
    advance(1000);
    expect(listener).toHaveBeenCalledTimes(calls);
    await source.stop();
  });

  it('reports itself stopped when a finite stream ends', async () => {
    const { source, advance } = create();
    await source.start();
    advance(60_000);
    expect(source.getStatus()).toBe('stopped');
  });
});

describe('SimulatedSensorSource', () => {
  it('delivers 50 Hz samples in 100 ms batches with simulated provenance', async () => {
    const scheduler = new ManualScheduler();
    const source = new SimulatedSensorSource({ script: LABELLED_SET_SCRIPT, simulation: BASE_SIMULATION, scheduler });
    const listener = jest.fn();
    source.subscribe(listener);
    await source.start();
    scheduler.advance(100);
    expect(listener).toHaveBeenCalledTimes(5);
    scheduler.advance(900);
    expect(listener).toHaveBeenCalledTimes(50);
    expect(source.provenance).toBe('simulated');
    await source.stop();
    expect(scheduler.activeTimers).toBe(0);
  });
});

describe('ReplaySensorSource', () => {
  it('in immediate mode emits the whole recording synchronously, identical to the input', async () => {
    const trace = labelledSetTrace();
    const source = new ReplaySensorSource({ id: 'replay-1', samples: trace.samples });
    const received: RawSensorSample[] = [];
    source.subscribe((s) => received.push(s));
    await source.start();
    expect(received).toEqual(trace.samples);
    expect(source.getStatus()).toBe('stopped');
    expect(source.provenance).toBe('replay');
  });
});
