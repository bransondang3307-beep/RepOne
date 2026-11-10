// RO-014 PR 4.2: component tests for the workout flow, in light and dark. Synthetic data only.
import { ManualScheduler } from '@repone/sensor-contracts/testing';
import { createInMemoryRepositories, enterResistance, type Machine, type WorkoutSet } from '@repone/workout-domain';
import * as ReactNative from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppServicesProvider } from '../../../application';
import { assembleContainer } from '../../../application/createAppContainer';
import { ExercisePicker, LINEAR_WARNING } from '../components/ExercisePicker';
import { ResistanceInput, parseResistance } from '../components/ResistanceInput';
import { SetRow, endedEarlyText } from '../components/SetRow';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { workoutStoreFor } from '../useWorkout';

const mounted: ReactTestRenderer[] = [];
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(ReactNative.Text).map((n) => [n.props.children].flat().join(''));
const labelled = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const button = (tree: ReactTestRenderer, label: string) => {
  const [found] = labelled(tree, label);
  if (!found) throw new Error(`no button "${label}" in: ${texts(tree).join(' | ')}`);
  return found;
};
const input = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((n) => n.type === ReactNative.TextInput && n.props.accessibilityLabel === label);

/** Lets the store's async actions and the snapshots they publish settle inside act(). */
async function settle() {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const set = (patch: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: 'set-1',
  workout_exercise_id: 'we-1',
  position: 0,
  status: 'planned',
  recording_session_id: null,
  resistance: null,
  ...patch,
});

describe('parseResistance and endedEarlyText', () => {
  it('accepts a positive weight with a dot or a comma, empty as "none", and rejects the rest', () => {
    expect(parseResistance('100')).toBe(100);
    expect(parseResistance(' 42,5 ')).toBe(42.5);
    expect(parseResistance('')).toBeNull();
    for (const bad of ['0', '-5', 'abc', '1001', 'Infinity']) expect(parseResistance(bad)).toBeUndefined();
  });

  it('explains a set that ended early, and says nothing for a normal end', () => {
    expect(endedEarlyText({ end_reason: 'sensor_error', sensor_error_code: 'connection_lost' })).toBe(
      'Ended early: the sensor connection was lost. The reps saved before that are kept.',
    );
    expect(endedEarlyText({ end_reason: 'start_failed', sensor_error_code: 'start_failed' })).toMatch(/could not start/);
    expect(endedEarlyText({ end_reason: 'stopped', sensor_error_code: null })).toBeNull();
    expect(endedEarlyText({ end_reason: 'stream_ended', sensor_error_code: null })).toBeNull();
    expect(endedEarlyText(null)).toBeNull();
  });
});

describe.each(['light', 'dark'] as const)('workout flow components (%s theme)', (scheme) => {
  beforeEach(() => jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => {
    act(() => mounted.splice(0).forEach((t) => t.unmount()));
    jest.restoreAllMocks();
  });

  it('ResistanceInput is labelled "entered", shows last time, and commits only a valid weight', () => {
    const onCommit = jest.fn();
    const tree = render(<ResistanceInput resistance={null} defaultUnit="lb" lastTime="100 lb" onCommit={onCommit} />);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Resistance · entered', 'Last time: 100 lb']));
    const field = input(tree, 'Resistance in lb, entered by you');

    act(() => field.props.onChangeText('abc'));
    act(() => field.props.onEndEditing());
    expect(onCommit).not.toHaveBeenCalled();
    expect(texts(tree).some((t) => t.startsWith('Enter a weight'))).toBe(true);

    act(() => field.props.onChangeText('42,5'));
    act(() => field.props.onEndEditing());
    expect(onCommit).toHaveBeenLastCalledWith(42.5, 'lb');

    act(() => button(tree, 'Kilograms').props.onPress());
    expect(onCommit).toHaveBeenLastCalledWith(42.5, 'kg');
  });

  it('ResistanceInput shows a stored value in its entered unit and does not re-save it unchanged', () => {
    const onCommit = jest.fn();
    const tree = render(<ResistanceInput resistance={enterResistance(100, 'lb')} defaultUnit="kg" onCommit={onCommit} />);
    const field = input(tree, 'Resistance in lb, entered by you');
    expect(field.props.value).toBe('100');
    act(() => field.props.onEndEditing());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ExercisePicker warns about a linear machine, for a new one and an existing one', async () => {
    const onCreate = jest.fn();
    const onAdd = jest.fn();
    const linear: Machine = { id: 'm-1', name: 'Leg press', motion_type: 'linear', notes: null, created_at_epoch_ms: 0 };
    const tree = render(
      <ExercisePicker
        exercises={[{ id: 'e-1', name: 'Press', created_at_epoch_ms: 0 }]}
        machinesFor={async () => [linear]}
        onAdd={onAdd}
        onCreate={onCreate}
        onCancel={() => undefined}
      />,
    );
    expect(texts(tree)).not.toContain(LINEAR_WARNING);

    // A new exercise on a linear machine.
    act(() => input(tree, 'New exercise name').props.onChangeText('Calf raise'));
    act(() => input(tree, 'Machine name, optional').props.onChangeText('Calf machine'));
    act(() => button(tree, 'Linear').props.onPress());
    expect(texts(tree)).toContain(LINEAR_WARNING);
    act(() => button(tree, 'Create and add').props.onPress());
    expect(onCreate).toHaveBeenCalledWith({ name: 'Calf raise', machine: { name: 'Calf machine', motionType: 'linear' } });

    act(() => button(tree, 'Rotating').props.onPress());
    expect(texts(tree)).not.toContain(LINEAR_WARNING);

    // An existing exercise and its linear machine.
    await act(async () => button(tree, 'Press').props.onPress());
    act(() => button(tree, 'Leg press').props.onPress());
    expect(texts(tree)).toContain(LINEAR_WARNING);
    act(() => button(tree, 'Add Press').props.onPress());
    expect(onAdd).toHaveBeenCalledWith('e-1', 'm-1');
  });

  it('ExercisePicker ignores a machine lookup that resolves after another exercise was chosen (Codex P2 on PR #46)', async () => {
    const pending = new Map<string, (machines: Machine[]) => void>();
    const machinesFor = (exerciseId: string) => new Promise<Machine[]>((resolve) => pending.set(exerciseId, resolve));
    const machine = (id: string, name: string): Machine => ({ id, name, motion_type: 'rotational', notes: null, created_at_epoch_ms: 0 });
    const onAdd = jest.fn();
    const tree = render(
      <ExercisePicker
        exercises={[
          { id: 'a', name: 'Row', created_at_epoch_ms: 0 },
          { id: 'b', name: 'Curl', created_at_epoch_ms: 0 },
        ]}
        machinesFor={machinesFor}
        onAdd={onAdd}
        onCreate={() => undefined}
        onCancel={() => undefined}
      />,
    );
    act(() => button(tree, 'Row').props.onPress());
    act(() => button(tree, 'Curl').props.onPress());
    await act(async () => pending.get('b')!([machine('m-b', 'Curl bench')]));
    await act(async () => pending.get('a')!([machine('m-a', 'Seated row')])); // late, for the earlier choice
    expect(labelled(tree, 'Seated row')).toHaveLength(0);
    act(() => button(tree, 'Curl bench').props.onPress());
    act(() => button(tree, 'Add Curl').props.onPress());
    expect(onAdd).toHaveBeenCalledWith('b', 'm-b');
  });

  it('SetRow shows a completed set with its reps, provenance and why it ended early', () => {
    const tree = render(
      <SetRow
        number={1}
        set={set({ status: 'completed', recording_session_id: 'rec-1', resistance: enterResistance(100, 'lb') })}
        result={{ set: set(), workout_id: 'w', exercise_id: 'e', machine_id: null, full_rep_count: 3, partial_rep_count: 1, provenance: 'simulated' }}
        outcome={{ end_reason: 'sensor_error', sensor_error_code: 'connection_lost' }}
        defaultUnit="kg"
        lastTime="90 lb"
        editable
        canRecord
        live={null}
        onRecord={jest.fn()}
        onStop={jest.fn()}
        onResistance={jest.fn()}
      />,
    );
    const shown = texts(tree);
    expect(shown).toEqual(expect.arrayContaining(['3 full · 1 partial', 'Simulated data — not a real measurement']));
    expect(shown).toContain('Ended early: the sensor connection was lost. The reps saved before that are kept.');
    expect(shown).not.toContain('Last time: 90 lb'); // only planned sets show last time
    expect(labelled(tree, 'Record set 1')).toHaveLength(0);
  });

  it('WorkoutScreen runs a workout end to end with the simulated sensor', async () => {
    const scheduler = new ManualScheduler();
    let now = 1_700_000_000_000;
    const container = assembleContainer(createInMemoryRepositories(), { now: () => (now += 1000) }, { scheduler, seed: 1 });
    const tree = render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <AppServicesProvider container={container}>
          <WorkoutScreen />
        </AppServicesProvider>
      </SafeAreaProvider>,
    );
    await settle();
    expect(texts(tree)).toContain('No workout yet');

    await act(async () => button(tree, 'New workout').props.onPress());
    await settle();
    act(() => button(tree, 'Add an exercise').props.onPress());
    act(() => input(tree, 'New exercise name').props.onChangeText('Row'));
    act(() => input(tree, 'Machine name, optional').props.onChangeText('Seated row'));
    await act(async () => button(tree, 'Create and add').props.onPress());
    await settle();
    expect(texts(tree)).toContain('Row · Seated row');

    await act(async () => button(tree, 'Add set').props.onPress());
    await settle();
    act(() => input(tree, 'Resistance in kg, entered by you').props.onChangeText('100'));
    act(() => button(tree, 'Pounds').props.onPress());
    await settle();
    expect(texts(tree)).toContain('Set 1');
    expect(labelled(tree, 'Record set 1')).toHaveLength(0); // not before the workout starts

    await act(async () => button(tree, 'Start workout').props.onPress());
    await settle();
    await act(async () => button(tree, 'Record set 1').props.onPress());
    await settle();
    await act(async () => {
      scheduler.advance(20_000);
    });
    await settle();
    expect(button(tree, 'Pause').props.disabled).toBe(true);
    expect(button(tree, 'Finish workout').props.disabled).toBe(true);
    expect(texts(tree)).toContain('Pause and finish are available between sets.');
    expect(texts(tree).some((t) => t.endsWith('partial so far'))).toBe(true);
    // The live counts are labelled as simulated while recording, not only once saved (Codex P1 on PR #46).
    expect(texts(tree)).toContain('Simulated data — not a real measurement');
    expect(
      tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Recording: ')).map((n) => n.props.accessibilityLabel),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/so far\. Simulated data — not a real measurement$/)]));

    await act(async () => button(tree, 'Stop set').props.onPress());
    await settle();
    expect(texts(tree)).toContain('Completed');
    expect(texts(tree)).toContain('Simulated data — not a real measurement');
    expect(button(tree, 'Pause').props.disabled).toBe(false);

    const stored = workoutStoreFor(container).getState().workout.record!;
    expect(stored.sets[0]).toMatchObject({ status: 'completed', resistance: { entered_unit: 'lb', source: 'user_entered' } });

    await act(async () => button(tree, 'Finish workout').props.onPress());
    await settle();
    expect(texts(tree)).toEqual(expect.arrayContaining(['Workout finished', 'Finished']));
    expect(labelled(tree, 'Add set')).toHaveLength(0);
    expect(labelled(tree, 'Add an exercise')).toHaveLength(0);
  });
});
