import type { WorkoutSessionSummary } from '@repone/workout-domain';
import * as ReactNative from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SetCard } from '../components/SetCard';
import { TodaySummaryCard } from '../components/TodaySummaryCard';
import { WeeklyRepsCard } from '../components/WeeklyRepsCard';

const NOW = new Date(2026, 9, 30, 18).getTime();
const set = (startedAt: number, full: number, partial: number, provenance: 'simulated' | 'sensor' = 'simulated'): WorkoutSessionSummary => ({
  id: `${startedAt}-${full}`,
  activity_type: 'gym',
  provenance,
  source_id: 'simulated-imu-01',
  source_kind: 'simulated',
  calibration_id: 'c',
  algorithm_version: 'v',
  machine_label: 'Lat pulldown',
  started_at_epoch_ms: startedAt,
  ended_at_epoch_ms: startedAt + 42_000,
  full_rep_count: full,
  partial_rep_count: partial,
});

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
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(ReactNative.Text).map((n) => [n.props.children].flat().join(''));

describe.each(['light', 'dark'] as const)('workout cards (%s theme)', (scheme) => {
  beforeEach(() => jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => {
    act(() => mounted.splice(0).forEach((t) => t.unmount()));
    jest.restoreAllMocks();
  });

  it("summarises today's reps from stored sets only, labelled with their provenance", () => {
    const sessions = [set(NOW - 3_600_000, 8, 2), set(NOW - 7_200_000, 4, 2), set(NOW - 2 * 86_400_000, 50, 0)];
    const tree = render(<TodaySummaryCard sessions={sessions} nowMs={NOW} />);
    expect(labels(tree)).toEqual(
      expect.arrayContaining(['Today: 75 percent of 16 reps were full reps', 'Sets: 2', 'Full reps: 12', 'Partial reps: 4']),
    );
    expect(texts(tree)).toContain('Simulated data — not a real measurement');
  });

  it('shows an empty today without a ring value or provenance badge', () => {
    const tree = render(<TodaySummaryCard sessions={[]} nowMs={NOW} />);
    expect(labels(tree)).toContain('No reps recorded today');
    expect(texts(tree)).not.toContain('Simulated data — not a real measurement');
  });

  it('charts the last 7 days and says how many sets it counts', () => {
    const sessions = [set(NOW - 3_600_000, 8, 2), set(NOW - 2 * 86_400_000, 5, 1), set(NOW - 20 * 86_400_000, 99, 0)];
    const tree = render(<WeeklyRepsCard sessions={sessions} nowMs={NOW} />);
    const chart = labels(tree).find((l) => l.startsWith('Reps per day'))!;
    expect(chart).toContain('8 full, 2 partial');
    expect(chart).toContain('5 full, 1 partial');
    expect(chart).not.toContain('99');
    expect(texts(tree)).toContain('Counted by the rep algorithm from 2 sets; unvalidated on real hardware.');
  });

  it('shows a set with its counts, label and provenance', () => {
    const tree = render(<SetCard set={set(NOW, 7, 3, 'sensor')} />);
    expect(labels(tree)[0]).toMatch(/^Lat pulldown: 7 full reps, 3 partial, at .+, 0m 42s$/);
    expect(texts(tree)).toContain('Live sensor');
  });
});
