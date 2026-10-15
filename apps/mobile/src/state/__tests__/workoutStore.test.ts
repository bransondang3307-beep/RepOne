import { DEMO_LOOP_SCRIPT, SimulatedSensorSource, createInMemoryRepositories, type Scheduler } from '@repone/core';
import { assembleContainer } from '../../di/createAppContainer';
import { createWorkoutStore } from '../workoutStore';

/** Advance-on-demand scheduler so the simulated sensor runs deterministically. */
function manualScheduler() {
  const timers = new Map<number, () => void>();
  let next = 1;
  const scheduler: Scheduler = {
    setInterval: (cb) => {
      timers.set(next, cb);
      return next++;
    },
    clearInterval: (h) => void timers.delete(h as number),
  };
  return { scheduler, tick: (n: number) => { for (let i = 0; i < n; i++) timers.forEach((cb) => cb()); } };
}

describe('workoutStore', () => {
  it('mirrors controller snapshots and refreshes history when a set finishes', async () => {
    const { scheduler, tick } = manualScheduler();
    const base = assembleContainer(createInMemoryRepositories(), { now: () => 1_700_000_000_000 });
    const container = {
      ...base,
      // Same simulated sensor as the app, but driven by a test scheduler.
      createSensor: () =>
        new SimulatedSensorSource({
          script: DEMO_LOOP_SCRIPT,
          simulation: { sourceId: 'sim-test', sampleRateHz: 50, seed: 1, gyroNoiseRadS: 0.02 },
          scheduler,
        }),
    };
    const store = createWorkoutStore(container);

    await store.getState().startSimulatedSet('  Lat pulldown  ');
    expect(store.getState().session.status).toBe('recording');
    expect(store.getState().session.provenance).toBe('simulated');

    tick(200); // 20 s of simulated motion at 100 ms per tick
    expect(store.getState().session.fullReps).toBeGreaterThan(0);

    await store.getState().stop();
    expect(store.getState().session.status).toBe('finished');
    await store.getState().refreshHistory();

    const [latest] = store.getState().history;
    expect(latest).toMatchObject({
      machine_label: 'Lat pulldown',
      provenance: 'simulated',
      full_rep_count: store.getState().session.fullReps,
    });

    store.getState().dismissResult();
    expect(store.getState().session.status).toBe('idle');
  });
});
