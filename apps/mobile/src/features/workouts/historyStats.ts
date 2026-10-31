import type { DataProvenance } from '@repone/sensor-contracts';
import type { WorkoutSessionSummary } from '@repone/workout-domain';

/**
 * Pure summaries of recorded sets for the dashboard and History. Everything is counted from stored sets — no
 * estimates, goals or targets — and every summary reports the provenance of the data it includes.
 */

export interface Totals {
  readonly sets: number;
  readonly fullReps: number;
  readonly partialReps: number;
}

export function totalsOf(sessions: readonly WorkoutSessionSummary[]): Totals {
  return sessions.reduce<Totals>(
    (t, s) => ({ sets: t.sets + 1, fullReps: t.fullReps + s.full_rep_count, partialReps: t.partialReps + s.partial_rep_count }),
    { sets: 0, fullReps: 0, partialReps: 0 },
  );
}

/**
 * The provenance a summary must be labelled with: the least real one it contains. A total that includes any
 * simulated set is labelled simulated, even if real sets are in it too. Null when there are no sets.
 */
export function provenanceOf(sessions: readonly WorkoutSessionSummary[]): DataProvenance | null {
  const kinds = new Set(sessions.map((s) => s.provenance));
  if (kinds.has('simulated')) return 'simulated';
  if (kinds.has('replay')) return 'replay';
  if (kinds.has('sensor')) return 'sensor';
  return null;
}

/** Local midnight of the day containing `epochMs`. */
export function startOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight `days` days before the day containing `epochMs` (calendar days, so DST-safe). */
function daysBefore(epochMs: number, days: number): number {
  const d = new Date(startOfDay(epochMs));
  d.setDate(d.getDate() - days);
  return d.getTime();
}

export function sessionsOnDay(sessions: readonly WorkoutSessionSummary[], dayStartMs: number): WorkoutSessionSummary[] {
  return sessions.filter((s) => startOfDay(s.started_at_epoch_ms) === dayStartMs);
}

export interface DayTotals extends Totals {
  readonly dayStartMs: number;
  readonly isToday: boolean;
}

/** Totals for each of the last `days` calendar days, oldest first; days without sets are zero. */
export function lastDays(sessions: readonly WorkoutSessionSummary[], days: number, nowMs: number): DayTotals[] {
  const today = startOfDay(nowMs);
  return Array.from({ length: days }, (_, i) => {
    const dayStartMs = daysBefore(nowMs, days - 1 - i);
    return { dayStartMs, isToday: dayStartMs === today, ...totalsOf(sessionsOnDay(sessions, dayStartMs)) };
  });
}

export interface DaySection {
  readonly dayStartMs: number;
  readonly title: string;
  readonly data: readonly WorkoutSessionSummary[];
}

/** Sets grouped by local calendar day, newest day first, keeping the given order inside each day. */
export function groupByDay(sessions: readonly WorkoutSessionSummary[], nowMs: number): DaySection[] {
  const sections = new Map<number, WorkoutSessionSummary[]>();
  for (const s of sessions) {
    const day = startOfDay(s.started_at_epoch_ms);
    sections.set(day, [...(sections.get(day) ?? []), s]);
  }
  return [...sections.entries()]
    .sort(([a], [b]) => b - a)
    .map(([dayStartMs, data]) => ({ dayStartMs, title: dayTitle(dayStartMs, nowMs), data }));
}

export function dayTitle(dayStartMs: number, nowMs: number): string {
  if (dayStartMs === startOfDay(nowMs)) return 'Today';
  if (dayStartMs === daysBefore(nowMs, 1)) return 'Yesterday';
  return new Date(dayStartMs).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** A set's recorded duration, e.g. "1m 05s"; "in progress" while it has no end time. */
export function formatDuration(s: Pick<WorkoutSessionSummary, 'started_at_epoch_ms' | 'ended_at_epoch_ms'>): string {
  if (s.ended_at_epoch_ms === null) return 'in progress';
  const seconds = Math.max(0, Math.round((s.ended_at_epoch_ms - s.started_at_epoch_ms) / 1000));
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}
