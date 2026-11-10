// RO-014 PR 4.2: a route without a tab (the workout screen, opened from Today) keeps the tab bar at three tabs and
// shows the tab it belongs to as selected (owner decision 3: "PR #30's tab bar unchanged").
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TabBar } from '../TabBar';

const routes = ['index', 'record', 'history', 'workout'].map((name) => ({ key: `${name}-key`, name }));
const descriptors = Object.fromEntries(
  routes.map((r) => [r.key, { options: { title: { index: 'Today', record: 'Record', history: 'History', workout: 'Workout' }[r.name] } }]),
);

function renderAt(routeName: string, navigateToTab = jest.fn()) {
  const props = {
    state: { index: routes.findIndex((r) => r.name === routeName), routes },
    descriptors,
    emitter: { emit: () => ({ defaultPrevented: false }) },
    navigateToTab,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    icons: { index: 'home', record: 'record', history: 'history' },
    hiddenRoutes: { workout: 'index' },
  } as unknown as React.ComponentProps<typeof TabBar>;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<TabBar {...props} />);
  });
  return tree;
}

const tabs = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');

describe('TabBar with a hidden route', () => {
  it('shows three tabs, never the hidden route', () => {
    const tree = renderAt('history');
    expect(tabs(tree).map((t) => t.props.accessibilityLabel)).toEqual(['Today', 'Record', 'History']);
    expect(tabs(tree).map((t) => t.props.accessibilityState.selected)).toEqual([false, false, true]);
    act(() => tree.unmount());
  });

  it('selects the parent tab while the hidden route is open, and navigates back to it on press', () => {
    const navigateToTab = jest.fn();
    const tree = renderAt('workout', navigateToTab);
    expect(tabs(tree).map((t) => t.props.accessibilityState.selected)).toEqual([true, false, false]);
    act(() => tabs(tree)[0]!.props.onPress());
    expect(navigateToTab).toHaveBeenCalledWith('index-key');
    act(() => tree.unmount());
  });
});
