import type { DataProvenance } from '@repone/sensor-contracts';
import type { WorkoutSessionSummary } from '@repone/workout-domain';
import { formatDuration, groupByDay, lastDays, provenanceOf, startOfDay, totalsOf } from '../historyStats';

// Local-time dates, so the day boundaries hold in any time zone the tests run in.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 10, 30, 18);

let n = 0;
function set(startedAt: number, full: number, partial: number, provenance: DataProvenance = 'simulated'): WorkoutSessionSummary {
  n += 1;
  return {
    id: `s${n}`,
    activity_type: 'gym',
    provenance,
    source_id: 'simulated-imu-01',
    source_kind: 'simulated',
    calibration_id: 'c',
    algorithm_version: 'v',
    machine_label: null,
    started_at_epoch_ms: startedAt,
    ended_at_epoch_ms: startedAt + 65_000,
    full_rep_count: full,
    partial_rep_count: partial,
  };
}

describe('historyStats', () => {
  it('totals sets and reps', () => {
    expect(totalsOf([])).toEqual({ sets: 0, fullReps: 0, partialReps: 0 });
    expect(totalsOf([set(NOW, 8, 2), set(NOW, 5, 0)])).toEqual({ sets: 2, fullReps: 13, partialReps: 2 });
  });

  it('labels a summary with the least real provenance it includes', () => {
    expect(provenanceOf([])).toBeNull();
    expect(provenanceOf([set(NOW, 1, 0, 'sensor')])).toBe('sensor');
    expect(provenanceOf([set(NOW, 1, 0, 'sensor'), set(NOW, 1, 0, 'replay')])).toBe('replay');
    expect(provenanceOf([set(NOW, 1, 0, 'sensor'), set(NOW, 1, 0, 'replay'), set(NOW, 1, 0, 'simulated')])).toBe('simulated');
  });

  it('sums the last 7 calendar days, oldest first, with empty days as zero', () => {
    const days = lastDays(
      [set(at(2026, 10, 30, 9), 8, 2), set(at(2026, 10, 30, 7), 4, 1), set(at(2026, 10, 28), 6, 0), set(at(2026, 10, 23), 9, 9)],
      7,
      NOW,
    );
    expect(days).toHaveLength(7);
    expect(days[0]!.dayStartMs).toBe(at(2026, 10, 24, 0));
    expect(days.map((d) => d.fullReps)).toEqual([0, 0, 0, 0, 6, 0, 12]);
    expect(days.map((d) => d.partialReps)).toEqual([0, 0, 0, 0, 0, 0, 3]);
    expect(days.map((d) => d.isToday)).toEqual([false, false, false, false, false, false, true]);
  });

  it('groups sets by day, newest day first, naming today and yesterday', () => {
    const sections = groupByDay([set(at(2026, 10, 30, 9), 1, 0), set(at(2026, 10, 29, 20), 2, 0), set(at(2026, 10, 30, 8), 3, 0), set(at(2026, 10, 20), 4, 0)], NOW);
    expect(sections.map((s) => s.dayStartMs)).toEqual([at(2026, 10, 30, 0), at(2026, 10, 29, 0), at(2026, 10, 20, 0)]);
    expect(sections.map((s) => s.data.map((d) => d.full_rep_count))).toEqual([[1, 3], [2], [4]]);
    expect(sections[0]!.title).toBe('Today');
    expect(sections[1]!.title).toBe('Yesterday');
    expect(sections[2]!.title).not.toMatch(/Today|Yesterday/);
  });

  it('finds local midnight', () => {
    expect(startOfDay(at(2026, 10, 30, 23, 59))).toBe(at(2026, 10, 30, 0));
  });

  it('formats a set duration, and an unfinished set as in progress', () => {
    expect(formatDuration({ started_at_epoch_ms: 0, ended_at_epoch_ms: 65_000 })).toBe('1m 05s');
    expect(formatDuration({ started_at_epoch_ms: 0, ended_at_epoch_ms: null })).toBe('in progress');
  });
});
