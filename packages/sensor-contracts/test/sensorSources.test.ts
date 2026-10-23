import {
  DEMO_LOOP_SCRIPT,
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SensorStartError,
  SimulatedSensorSource,
  type RawSensorSample,
  type SensorStatus,
  type SimulatedFault,
} from '../src';
import { ManualScheduler, describeSensorSourceContract } from '../src/testing';
import { BASE_SIMULATION, labelledSetTrace } from './fixtures';

function simulatedHarness(script = LABELLED_SET_SCRIPT, fault?: SimulatedFault) {
  const scheduler = new ManualScheduler();
  const source = new SimulatedSensorSource({ script, simulation: BASE_SIMULATION, scheduler, fault });
  return { source, advance: (ms: number) => scheduler.advance(ms) };
}

describeSensorSourceContract('SimulatedSensorSource', () => simulatedHarness(), {
  createFailingHarness: () => simulatedHarness(LABELLED_SET_SCRIPT, { afterSamples: 20, code: 'connection_lost' }),
  createStartFailureHarness: () => simulatedHarness(LABELLED_SET_SCRIPT, { afterSamples: 0, code: 'start_failed' }),
});

describeSensorSourceContract('SimulatedSensorSource (looping live demo)', () => simulatedHarness(DEMO_LOOP_SCRIPT), {
  finite: false,
});

describeSensorSourceContract('ReplaySensorSource (realtime)', () => {
  const scheduler = new ManualScheduler();
  const source = new ReplaySensorSource({ id: 'replay-1', samples: labelledSetTrace().samples, mode: 'realtime', scheduler });
  return { source, advance: (ms) => scheduler.advance(ms) };
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

  it('without a fault, streams exactly the samples of the generated trace', async () => {
    const { source, advance } = simulatedHarness();
    const received: RawSensorSample[] = [];
    source.subscribe((s) => received.push(s));
    await source.start();
    advance(60_000);
    expect(source.getStatus()).toBe('stopped');
    expect(received).toEqual(labelledSetTrace().samples);
  });

  it('fails after exactly `afterSamples` samples, releases its timer and keeps the reason', async () => {
    const scheduler = new ManualScheduler();
    const source = new SimulatedSensorSource({
      script: LABELLED_SET_SCRIPT,
      simulation: BASE_SIMULATION,
      scheduler,
      fault: { afterSamples: 37, code: 'connection_lost', message: 'Simulated cable unplugged' },
    });
    const received: RawSensorSample[] = [];
    source.subscribe((s) => received.push(s));
    await source.start();
    scheduler.advance(5000);
    expect(received).toEqual(labelledSetTrace().samples.slice(0, 37));
    expect(source.getStatus()).toBe('error');
    expect(source.getLastError()).toEqual({ code: 'connection_lost', message: 'Simulated cable unplugged' });
    expect(scheduler.activeTimers).toBe(0);
  });

  it('can be restarted after an error, which clears the reason until it fails again', async () => {
    const { source, advance } = simulatedHarness(LABELLED_SET_SCRIPT, { afterSamples: 10, code: 'stream_timeout' });
    const statuses: SensorStatus[] = [];
    source.subscribeStatus((s) => statuses.push(s));
    await source.start();
    advance(1000);
    expect(source.getLastError()?.code).toBe('stream_timeout');
    await source.start();
    expect(source.getStatus()).toBe('streaming');
    expect(source.getLastError()).toBeNull();
    advance(1000);
    expect(statuses).toEqual(['streaming', 'error', 'streaming', 'error']);
    expect(source.getLastError()).toEqual({ code: 'stream_timeout', message: 'Simulated fault: stream_timeout' });
  });

  it('rejects start() when the fault is at sample 0', async () => {
    const { source } = simulatedHarness(LABELLED_SET_SCRIPT, { afterSamples: 0, code: 'start_failed', message: 'Port busy' });
    await expect(source.start()).rejects.toEqual(new SensorStartError({ code: 'start_failed', message: 'Port busy' }));
    expect(source.getLastError()).toEqual({ code: 'start_failed', message: 'Port busy' });
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
    expect(source.getLastError()).toBeNull();
  });
});
