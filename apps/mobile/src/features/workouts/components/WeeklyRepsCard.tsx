import type { WorkoutSessionSummary } from '@repone/workout-domain';
import { StyleSheet, Text, View } from 'react-native';
import { BarChart, Card, ProvenanceBadge, useTheme, useThemedStyles, type Theme } from '../../../shared';
import { lastDays, provenanceOf } from '../historyStats';

/** Full and partial reps per day for the last seven days, stacked, from the recorded sets. */
export function WeeklyRepsCard({ sessions, nowMs }: { sessions: readonly WorkoutSessionSummary[]; nowMs: number }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const days = lastDays(sessions, 7, nowMs);
  const included = sessions.filter((s) => s.started_at_epoch_ms >= days[0]!.dayStartMs);
  const provenance = provenanceOf(included);
  const weekday = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'narrow' });

  return (
    <Card title="Last 7 days" accessory={<Legend />}>
      <BarChart
        data={days.map((d) => ({
          key: String(d.dayStartMs),
          label: weekday(d.dayStartMs),
          highlight: d.isToday,
          segments: [
            { amount: d.fullReps, color: colors.full },
            { amount: d.partialReps, color: colors.partial },
          ],
        }))}
        accessibilityLabel={`Reps per day, last 7 days: ${days
          .map((d) => `${new Date(d.dayStartMs).toLocaleDateString(undefined, { weekday: 'long' })} ${d.fullReps} full, ${d.partialReps} partial`)
          .join('; ')}`}
      />
      <Text style={styles.caption}>
        {included.length === 0
          ? 'No sets recorded in the last 7 days.'
          : `Counted by the rep algorithm from ${included.length} ${included.length === 1 ? 'set' : 'sets'}; unvalidated on real hardware.`}
      </Text>
      {provenance && <ProvenanceBadge provenance={provenance} />}
    </Card>
  );
}

function Legend() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.legend}>
      {[
        ['Full', colors.full],
        ['Partial', colors.partial],
      ].map(([label, color]) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.legendText}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    caption: { ...typography.caption, color: colors.textMuted },
    legend: { flexDirection: 'row', gap: spacing.sm + 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { ...typography.caption, color: colors.textMuted },
  });
