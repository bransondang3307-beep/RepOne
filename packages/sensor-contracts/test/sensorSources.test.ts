import {
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SimulatedSensorSource,
  type RawSensorSample,
} from '../src';
import { ManualScheduler, describeSensorSourceContract } from '../src/testing';
import { BASE_SIMULATION, labelledSetTrace } from './fixtures';

describeSensorSourceContract('SimulatedSensorSource', () => {
  const scheduler = new ManualScheduler();
  const source = new SimulatedSensorSource({ script: LABELLED_SET_SCRIPT, simulation: BASE_SIMULATION, scheduler });
  return { source, advance: (ms) => scheduler.advance(ms) };
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
