// RO-014 PR 4.3: History's workout list and detail, read from storage; Today's workout cards. Light and dark.
// Every recording here is SYNTHETIC (replayed or simulated): nothing measures real reps.
import { RotationalRepDetector } from '@repone/rep-engine';
import {
  LABELLED_SET_SCRIPT,
  ReplaySensorSource,
  SimulatedSensorSource,
  createSyntheticCalibration,
  generateTrace,
  type SensorSource,
  type SimulationOptions,
} from '@repone/sensor-contracts';
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createInMemoryRepositories } from '@repone/workout-domain';
import * as ReactNative from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { WorkoutController } from '../../../application/services/WorkoutController';
import { WorkoutSessionController } from '../../../application/services/WorkoutSessionController';
import { PressableScale, SegmentedControl } from '../../../shared';
import { WorkoutCard } from '../components/WorkoutCard';
import { leastRealProvenance, loadWorkoutList, type WorkoutListItem } from '../workoutList';

const SIMULATION: SimulationOptions = { sourceId: 'sim-test-01', sampleRateHz: 50, seed: 42, gyroNoiseRadS: 0.02 };
const calibration = createSyntheticCalibration(0);
const replay = () => new ReplaySensorSource({ id: 'replay-1', samples: generateTrace(LABELLED_SET_SCRIPT, SIMULATION).samples, provenance: 'simulated' });

/** Two workouts and a standalone quick set, stored in memory through the real application services. */
async function history() {
  const repositories = createInMemoryRepositories();
  let now = 1_700_000_000_000;
  const clock = { now: () => (now += 60_000) };
  let n = 0;
  const recorder = new WorkoutSessionController({ repositories, clock, createId: () => `rec-${++n}`, createDetector: (id, cal) => new RotationalRepDetector(id, cal) });
  let sensor: () => SensorSource = replay;
  let ids = 0;
  const workouts = new WorkoutController({ repositories, recorder, clock, createId: () => `id-${++ids}`, getSessionSensor: async () => sensor(), getCalibration: () => calibration });

  // A quick set before any workout: it stays a standalone recording.
  await recorder.start({ sensor: replay(), calibration, machineLabel: 'Quick set' });
  await new Promise<void>((resolve) => {
    const check = () => ['finished', 'error'].includes(recorder.getSnapshot().status) && resolve();
    check();
    recorder.subscribe(check);
  });

  // Workout 1: Row on Seated row, set 1 recorded at 100 lb, set 2 ended by a sensor failure; finished.
  const { exercise: row, machine } = await workouts.createExercise('Row', { name: 'Seated row', motion_type: 'rotational' });
  await workouts.create();
  const rowEntry = await workouts.addExercise(row.id, machine!.id);
  const s1 = await workouts.addSet(rowEntry);
  await workouts.setResistance(s1, 100, 'lb');
  const s2 = await workouts.addSet(rowEntry);
  await workouts.start();
  await (await workouts.recordSet(s1)).settled;
  const scheduler = new ManualScheduler();
  sensor = () => new SimulatedSensorSource({ script: LABELLED_SET_SCRIPT, simulation: SIMULATION, scheduler, fault: { afterSamples: 400, code: 'connection_lost' } });
  const failing = await workouts.recordSet(s2);
  scheduler.advance(60_000);
  await failing.settled;
  await workouts.finish();

  // Workout 2: still open, nothing recorded.
  const { exercise: curl } = await workouts.createExercise('Curl');
  await workouts.create();
  await workouts.addSet(await workouts.addExercise(curl.id));

  return { repositories, now: () => now };
}

describe('loadWorkoutList', () => {
  it('lists workouts newest first with their sets, outcomes and provenance; the quick set is not a workout', async () => {
    const { repositories } = await history();
    const list = await loadWorkoutList(repositories, 10);
    expect(list.map((w) => w.exerciseNames)).toEqual([['Curl'], ['Row']]);

    const [open, done] = list as [WorkoutListItem, WorkoutListItem];
    expect(open.summary.workout.status).toBe('planned');
    expect(open.provenance).toBeNull(); // nothing recorded: no data to label
    expect(open.sets.map((s) => s.result.set.status)).toEqual(['planned']);

    expect(done.summary).toMatchObject({ set_count: 2, completed_set_count: 2 });
    expect(done.summary.full_rep_count).toBeGreaterThanOrEqual(8);
    expect(done.provenance).toBe('simulated');
    expect(done.sets.map((s) => [s.exerciseTitle, s.number])).toEqual([
      ['Row · Seated row', 1],
      ['Row · Seated row', 2],
    ]);
    expect(done.sets[0]!.result).toMatchObject({ full_rep_count: 8, partial_rep_count: 2, provenance: 'simulated' });
    expect(done.sets[0]!.outcome).toEqual({ end_reason: 'stream_ended', sensor_error_code: null });
    expect(done.sets[1]!.outcome).toEqual({ end_reason: 'sensor_error', sensor_error_code: 'connection_lost' });

    // The standalone quick set is still a recording of its own, listed with every other set.
    const recordings = await repositories.sessions.listRecent(10);
    expect(recordings.map((r) => r.machine_label)).toContain('Quick set');
  });

  it('labels the totals of a workout whose set is still recording with that recording\'s provenance (Codex P1 on PR #47)', async () => {
    const repositories = createInMemoryRepositories();
    let now = 1_700_000_000_000;
    const clock = { now: () => (now += 1000) };
    const recorder = new WorkoutSessionController({ repositories, clock, createId: () => 'rec-live', createDetector: (id, cal) => new RotationalRepDetector(id, cal) });
    const scheduler = new ManualScheduler();
    let ids = 0;
    const workouts = new WorkoutController({
      repositories,
      recorder,
      clock,
      createId: () => `id-${++ids}`,
      getSessionSensor: async () => new SimulatedSensorSource({ script: LABELLED_SET_SCRIPT, simulation: SIMULATION, scheduler }),
      getCalibration: () => calibration,
    });
    const { exercise } = await workouts.createExercise('Row');
    await workouts.create();
    const set = await workouts.addSet(await workouts.addExercise(exercise.id));
    await workouts.start();
    const handle = await workouts.recordSet(set);
    // Advance until the first rep events are saved, while the set is still recording.
    for (let s = 0; s < 60 && (await repositories.repEvents.listBySession('rec-live')).length === 0; s++) {
      scheduler.advance(1000);
      for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(recorder.getSnapshot().status).toBe('recording');

    const [item] = await loadWorkoutList(repositories, 5);
    expect(item!.sets[0]!.result.set.status).toBe('recording');
    expect(item!.summary.full_rep_count + item!.summary.partial_rep_count).toBeGreaterThan(0);
    expect(item!.provenance).toBe('simulated');

    await workouts.stopSet();
    await handle.settled;
  });

  it('labels a total with the least real provenance in it', () => {
    expect(leastRealProvenance(['sensor', 'simulated'])).toBe('simulated');
    expect(leastRealProvenance(['sensor', 'replay'])).toBe('replay');
    expect(leastRealProvenance(['sensor', null])).toBe('sensor');
    expect(leastRealProvenance([null])).toBeNull();
  });
});

const mounted: ReactTestRenderer[] = [];
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(ReactNative.Text).map((n) => [n.props.children].flat().join(''));
const labels = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);

describe.each(['light', 'dark'] as const)('WorkoutCard and SegmentedControl (%s theme)', (scheme) => {
  let list: WorkoutListItem[];
  let nowMs: number;
  beforeAll(async () => {
    const h = await history();
    list = await loadWorkoutList(h.repositories, 10);
    nowMs = h.now();
  });
  beforeEach(() => jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => {
    act(() => mounted.splice(0).forEach((t) => t.unmount()));
    jest.restoreAllMocks();
  });

  it('summarises a workout with its totals and provenance, and keeps the provenance in its spoken label', () => {
    const done = list[1]!;
    const tree = render(<WorkoutCard item={done} nowMs={nowMs} />);
    const shown = texts(tree);
    expect(shown).toContain('Row');
    expect(shown.some((t) => t.startsWith('2 of 2 sets recorded · '))).toBe(true);
    expect(shown).toContain('Simulated data — not a real measurement');
    expect(labels(tree).some((l) => l.startsWith('Row. ') && l.endsWith('Simulated data — not a real measurement'))).toBe(true);
    expect(shown.some((t) => t.includes('entered'))).toBe(false); // collapsed: no set detail
  });

  it('expanded, lists each set with the resistance entered, its reps, provenance and an early end', () => {
    const onPress = jest.fn();
    const tree = render(<WorkoutCard item={list[1]!} nowMs={nowMs} expanded onPress={onPress} />);
    const shown = texts(tree);
    expect(shown).toContain('100 lb entered · 8 full · 2 partial');
    expect(shown.some((t) => t.startsWith('no resistance entered · '))).toBe(true);
    expect(shown).toContain('Ended early: the sensor connection was lost. The reps saved before that are kept.');
    expect(shown.filter((t) => t === 'Simulated data — not a real measurement').length).toBe(3); // workout + 2 sets
    act(() => tree.root.findAllByType(PressableScale)[0]!.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });

  it('shows an open workout with its status and no provenance badge', () => {
    const tree = render(<WorkoutCard item={list[0]!} nowMs={nowMs} />);
    expect(texts(tree).some((t) => t.endsWith('· Not started'))).toBe(true);
    expect(texts(tree)).not.toContain('Simulated data — not a real measurement');
  });

  it('SegmentedControl marks the chosen view and reports a change', () => {
    const onChange = jest.fn();
    const tree = render(
      <SegmentedControl
        options={[
          { value: 'workouts', label: 'Workouts' },
          { value: 'sets', label: 'All sets' },
        ]}
        value="workouts"
        onChange={onChange}
        accessibilityLabel="History view"
      />,
    );
    const tabs = tree.root.findAllByType(PressableScale);
    expect(tabs.map((t) => t.props.accessibilityState.selected)).toEqual([true, false]);
    act(() => tabs[1]!.props.onPress());
    expect(onChange).toHaveBeenCalledWith('sets');
  });
});
