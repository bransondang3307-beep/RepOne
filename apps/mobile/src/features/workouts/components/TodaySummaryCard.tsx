import type { WorkoutSessionSummary } from '@repone/workout-domain';
import { StyleSheet, Text, View } from 'react-native';
import { Card, ProvenanceBadge, RingChart, StatTile, useTheme, useThemedStyles, type Theme } from '../../../shared';
import { provenanceOf, sessionsOnDay, startOfDay, totalsOf } from '../historyStats';

/**
 * Today at a glance: the ring splits today's reps into full and partial (a composition, not progress toward a
 * goal), next to the day's set and rep totals.
 */
export function TodaySummaryCard({ sessions, nowMs }: { sessions: readonly WorkoutSessionSummary[]; nowMs: number }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const today = sessionsOnDay(sessions, startOfDay(nowMs));
  const { sets, fullReps, partialReps } = totalsOf(today);
  const reps = fullReps + partialReps;
  const provenance = provenanceOf(today);
  const fullShare = reps ? Math.round((fullReps / reps) * 100) : 0;

  return (
    <Card>
      <View style={styles.row}>
        <RingChart
          size={148}
          strokeWidth={14}
          trackColor={colors.track}
          rings={[
            {
              segments: [
                { fraction: reps ? fullReps / reps : 0, color: colors.full },
                { fraction: reps ? partialReps / reps : 0, color: colors.partial },
              ],
            },
          ]}
          accessibilityLabel={
            reps ? `Today: ${fullShare} percent of ${reps} reps were full reps` : 'No reps recorded today'
          }
        >
          <Text style={styles.ringValue}>{reps ? `${fullShare}%` : '–'}</Text>
          <Text style={styles.ringLabel}>{reps ? 'full reps' : 'no reps yet'}</Text>
        </RingChart>
        <View style={styles.stats}>
          <StatTile label="Sets" value={sets} accent={colors.primary} />
          <StatTile label="Full reps" value={fullReps} accent={colors.full} />
          <StatTile label="Partial reps" value={partialReps} accent={colors.partial} />
        </View>
      </View>
      {provenance ? (
        <ProvenanceBadge provenance={provenance} />
      ) : (
        <Text style={styles.empty}>Record a set and today's reps appear here.</Text>
      )}
    </Card>
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md + 4 },
    stats: { flex: 1, gap: spacing.sm + 2 },
    ringValue: { ...typography.stat, color: colors.text, fontVariant: ['tabular-nums'] },
    ringLabel: { ...typography.caption, color: colors.textMuted },
    empty: { ...typography.caption, color: colors.textMuted },
  });
