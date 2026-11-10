// RO-014 PR 4.3: the History screen (app/history.tsx) with a workout, a standalone quick set and a recording saved
// before outcomes were stored (as before Milestone 3). "All sets" must still list every recording (Codex P2 on PR #47).
// SYNTHETIC data only.
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createInMemoryRepositories } from '@repone/workout-domain';
import * as ReactNative from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import HistoryScreen from '../../../../app/history';
import { AppServicesProvider } from '../../../application';
import { assembleContainer } from '../../../application/createAppContainer';
import { PressableScale } from '../../../shared';

// History reloads on focus; in a test the screen is focused once, when it mounts.
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return { useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]) };
});

async function storedHistory() {
  let now = 1_700_000_000_000;
  const repositories = createInMemoryRepositories();
  const scheduler = new ManualScheduler();
  const container = assembleContainer(repositories, { now: () => (now += 60_000) }, { scheduler, seed: 1 });

  // A recording saved before outcomes existed: no end reason, no workout.
  await repositories.calibrations.save(container.getCalibration());
  await repositories.sessions.create({
    id: 'old-1',
    activity_type: 'gym',
    provenance: 'simulated',
    source_id: 'simulated-imu-01',
    source_kind: 'simulated',
    calibration_id: container.getCalibration().calibration_id,
    algorithm_version: 'v0',
    machine_label: 'Old recording',
    started_at_epoch_ms: now,
    ended_at_epoch_ms: now + 30_000,
  });
  await repositories.sessions.markEnded('old-1', now + 30_000);

  // A standalone quick set, on the app's simulated device.
  await container.controller.start({ sensor: await container.getSessionSensor(), calibration: container.getCalibration(), machineLabel: 'Quick set' });
  scheduler.advance(5000);
  await container.controller.stop();
  container.controller.reset();

  // A finished workout with one recorded set, on the same device.
  const { workouts } = container;
  const { exercise, machine } = await workouts.createExercise('Row', { name: 'Seated row', motion_type: 'rotational' });
  await workouts.create();
  const set = await workouts.addSet(await workouts.addExercise(exercise.id, machine!.id));
  await workouts.start();
  const handle = await workouts.recordSet(set);
  scheduler.advance(10_000);
  await workouts.stopSet();
  await handle.settled;
  await workouts.finish();
  return container;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(ReactNative.Text).map((n) => [n.props.children].flat().join(''));
const labels = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);
async function settle() {
  for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

describe.each(['light', 'dark'] as const)('History screen (%s theme)', (scheme) => {
  beforeEach(() => jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => jest.restoreAllMocks());

  it('shows workouts first, and All sets still lists the quick set and the older recording', async () => {
    const container = await storedHistory();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
          <AppServicesProvider container={container}>
            <HistoryScreen />
          </AppServicesProvider>
        </SafeAreaProvider>,
      );
    });
    await settle();

    // Workouts (the default when there are any): the workout card, not the standalone recordings.
    expect(texts(tree)).toContain('Row');
    expect(labels(tree).some((l) => l.startsWith('Row. ') && l.endsWith('Simulated data — not a real measurement'))).toBe(true);
    expect(labels(tree).some((l) => l.startsWith('Quick set:'))).toBe(false);

    const tab = (label: string) => tree.root.findAllByType(PressableScale).find((n) => n.props.accessibilityLabel === label)!;
    await act(async () => tab('All sets').props.onPress());
    await settle();

    // All sets: every recording, the workout's set included, each with its provenance.
    const sets = labels(tree);
    for (const label of ['Quick set:', 'Old recording:', 'Row · Seated row:']) {
      expect(sets.some((l) => l.startsWith(label) && l.endsWith('Simulated data — not a real measurement'))).toBe(true);
    }
    act(() => tree.unmount());
  });
});
