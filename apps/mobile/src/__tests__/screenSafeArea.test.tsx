import { ScrollView, SectionList } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

// RO-028 (the owner's iPhone: the top of the home screen sat under the title bar). PR #24 fixed it with
// contentInsetAdjustmentBehavior under a translucent native header. The redesign (RO-030) removes that header
// (`headerShown: false`) and has every screen draw its own title below the status bar's safe-area inset. This keeps
// RO-028's regression coverage for that approach: the first content starts below the top inset on the scrolling
// screens and on History. Jest has no native layout, so it pins the padding, not pixels.

const TOP_INSET = 59; // an iPhone with a Dynamic Island, in points
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../features/workouts', () => ({
  ...jest.requireActual('../features/workouts'),
  useWorkoutHistory: () => ({ sessions: [], loading: false, error: null }),
}));

import HistoryScreen from '../../app/history';
import { Screen } from '../shared';

const mounted: ReactTestRenderer[] = [];
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}
afterEach(() => act(() => mounted.splice(0).forEach((t) => t.unmount())));

const paddingTop = (style: unknown) => [style].flat(Infinity).reduce<number | undefined>((top, s) => (s as { paddingTop?: number })?.paddingTop ?? top, undefined);

it('a scrolling screen (Today, Record) starts its content below the top safe-area inset', () => {
  const tree = render(
    <Screen title="Today">
      <></>
    </Screen>,
  );
  const top = paddingTop(tree.root.findByType(ScrollView).props.contentContainerStyle);
  expect(top).toBeGreaterThan(TOP_INSET);
});

it('History starts its content below the top safe-area inset', () => {
  const tree = render(<HistoryScreen />);
  const top = paddingTop(tree.root.findByType(SectionList).props.contentContainerStyle);
  expect(top).toBeGreaterThan(TOP_INSET);
});
