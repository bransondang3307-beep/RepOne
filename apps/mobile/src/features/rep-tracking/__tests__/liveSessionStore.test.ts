import { DEMO_LOOP_SCRIPT, SimulatedSensorSource } from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createInMemoryRepositories } from '@repone/workout-domain';
import { assembleContainer } from '../../../application/createAppContainer';
import { createLiveSessionStore } from '../liveSessionStore';

describe('liveSessionStore', () => {
  it('mirrors controller snapshots through start, stop and dismiss', async () => {
    const scheduler = new ManualScheduler();
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
    const store = createLiveSessionStore(container);

    await store.getState().startSimulatedSet('  Lat pulldown  ');
    expect(store.getState().session.status).toBe('recording');
    expect(store.getState().session.provenance).toBe('simulated');

    scheduler.advance(20_000); // 20 s of simulated motion
    expect(store.getState().session.fullReps).toBeGreaterThan(0);

    await store.getState().stop();
    expect(store.getState().session.status).toBe('finished');
    const [latest] = await container.repositories.sessions.listRecent(1);
    expect(latest).toMatchObject({
      machine_label: 'Lat pulldown',
      provenance: 'simulated',
      full_rep_count: store.getState().session.fullReps,
    });

    store.getState().dismissResult();
    expect(store.getState().session.status).toBe('idle');
  });
});
