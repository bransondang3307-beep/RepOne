import * as ReactNative from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { LiveRepRing } from '../components/LiveRepRing';
import { RepStrip } from '../components/RepStrip';
import { formatElapsed } from '../useElapsed';

// Unmounted after each test, so no animation or pending effect outlives it.
const mounted: ReactTestRenderer[] = [];
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}

const labels = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);

describe.each(['light', 'dark'] as const)('live set display (%s theme)', (scheme) => {
  beforeEach(() => jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => {
    act(() => mounted.splice(0).forEach((t) => t.unmount()));
    jest.restoreAllMocks();
  });

  it('states the live counts and the recording state on the ring', () => {
    expect(labels(render(<LiveRepRing fullReps={9} partialReps={2} recording />))).toContain(
      '9 full reps and 2 partial reps in this set, recording',
    );
    expect(labels(render(<LiveRepRing fullReps={0} partialReps={0} recording={false} />))).toContain(
      '0 full reps and 0 partial reps in this set',
    );
  });

  it('draws one bar per detected rep and summarises them', () => {
    const tree = render(
      <RepStrip
        reps={[
          { classification: 'full', peakExcursionRad: 1.2, timestampMs: 1 },
          { classification: 'partial', peakExcursionRad: 0.5, timestampMs: 2 },
          { classification: 'full', peakExcursionRad: 1.1, timestampMs: 3 },
        ]}
      />,
    );
    expect(new Set(labels(tree))).toEqual(new Set(['3 reps detected: 2 full, 1 partial']));
  });
});

describe('formatElapsed', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_400)).toBe('1:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});
