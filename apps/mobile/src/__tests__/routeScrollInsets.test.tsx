import { FlatList, ScrollView } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import HistoryScreen from '../../app/history';
import WorkoutScreen from '../../app/index';

// RO-028: on iOS the screens are laid out under the translucent title bar, so the top of the home screen sat behind
// it on the owner's iPhone. Jest has no native layout, so this pins the fix: both scroll containers let iOS inset
// their content below the bar and the status bar.

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return { Link: ({ children }: { children: string }) => <Text>{children}</Text> };
});
// Also mocks the hook the home screen reads once RO-029's sensor choice lands (PR #28), so this test holds either way.
jest.mock('../features/device-connection', () => ({
  DeviceConnectionPanel: () => null,
  useDeviceConnection: (select: (s: { sensorKind: 'simulated' }) => unknown) => select({ sensorKind: 'simulated' }),
}));
jest.mock('../features/rep-tracking', () => {
  const state = {
    session: { status: 'idle', provenance: null, fullReps: 0, partialReps: 0, samplesReceived: 0, error: null },
    startSimulatedSet: jest.fn(),
    startSet: jest.fn(), // the name after RO-029 (PR #28)
    stop: jest.fn(),
    dismissResult: jest.fn(),
  };
  return {
    RepCounter: () => null,
    useLiveSession: (select: (s: typeof state) => unknown) => select(state),
  };
});
jest.mock('../features/workouts', () => ({
  useWorkoutHistory: () => ({ sessions: [], loading: false, error: null }),
}));

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('route scroll containers (RO-028)', () => {
  it('home screen: content is inset below the translucent iOS title bar', () => {
    const scroll = render(<WorkoutScreen />).root.findByType(ScrollView);
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
  });

  it('history screen: the list is inset below the translucent iOS title bar', () => {
    const list = render(<HistoryScreen />).root.findByType(FlatList);
    expect(list.props.contentInsetAdjustmentBehavior).toBe('automatic');
  });
});
