import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createInMemoryRepositories } from '@repone/workout-domain';
import { assembleContainer } from '../../../application/createAppContainer';
import type { SessionSnapshot } from '../../../application';
import { createLiveSessionStore } from '../liveSessionStore';

/** The app's composition (simulated device included), driven by a test scheduler. Synthetic data only. */
function setup() {
  const scheduler = new ManualScheduler();
  const container = assembleContainer(createInMemoryRepositories(), { now: () => 1_700_000_000_000 }, { scheduler, seed: 1 });
  return { scheduler, container, store: createLiveSessionStore(container) };
}

const settled = (store: ReturnType<typeof setup>['store']) =>
  new Promise<SessionSnapshot>((resolve) => {
    const check = ({ session }: { session: SessionSnapshot }) =>
      (session.status === 'finished' || session.status === 'error') && resolve(session);
    check(store.getState());
    store.subscribe(check);
  });

describe('liveSessionStore', () => {
  it('mirrors controller snapshots through start, stop and dismiss', async () => {
    const { scheduler, container, store } = setup();

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
      source_id: 'simulated-imu-01',
      source_kind: 'simulated',
      full_rep_count: store.getState().session.fullReps,
    });

    store.getState().dismissResult();
    expect(store.getState().session.status).toBe('idle');
  });

  it('connects the simulated device when a set starts', async () => {
    const { container, store } = setup();
    expect(container.device.getState()).toBe('disconnected');
    await store.getState().startSimulatedSet();
    expect(container.device.getState()).toBe('connected');
    await store.getState().stop();
  });

  it('ends the set in error when the device connection is lost, and records again after reconnecting', async () => {
    const { scheduler, container, store } = setup();
    await store.getState().startSimulatedSet();
    scheduler.advance(5000);

    container.simulateConnectionLoss!();
    const final = await settled(store);
    expect(final).toMatchObject({ status: 'error', samplesReceived: 250, sensorError: { code: 'connection_lost' } });
    expect(final.error).toBe(
      'The sensor connection was lost (connection loss simulated from the app). The 250 samples received before the failure were saved.',
    );
    expect(container.device.getState()).toBe('failed');

    store.getState().dismissResult();
    await store.getState().startSimulatedSet();
    expect(container.device.getState()).toBe('connected');
    expect(store.getState().session.status).toBe('recording');
    await store.getState().stop();
  });
});
