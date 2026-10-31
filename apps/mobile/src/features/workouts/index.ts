// workouts feature public API: recorded-set history and its summaries (sessions, exercises and sets arrive in Milestone 3).
export { SetCard } from './components/SetCard';
export { TodaySummaryCard } from './components/TodaySummaryCard';
export { WeeklyRepsCard } from './components/WeeklyRepsCard';
export { groupByDay, totalsOf, provenanceOf, type DaySection, type Totals } from './historyStats';
export { useWorkoutHistory, type WorkoutHistoryState } from './useWorkoutHistory';
