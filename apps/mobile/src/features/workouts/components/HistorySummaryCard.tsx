import type { WorkoutSessionSummary } from '@repone/workout-domain';
import { StyleSheet, Text, View } from 'react-native';
import { Card, ProvenanceBadge, StatTile, useTheme, useThemedStyles, type Theme } from '../../../shared';
import { provenanceOf, totalsOf } from '../historyStats';

/**
 * Totals of the loaded sets at the top of History. Like every rep total, it carries the provenance of the least
 * real data it includes, so simulated totals are never mistaken for real ones (e.g. when the set cards are
 * scrolled away).
 */
export function HistorySummaryCard({ sessions }: { sessions: readonly WorkoutSessionSummary[] }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const totals = totalsOf(sessions);
  const provenance = provenanceOf(sessions);
  return (
    <Card>
      <View style={styles.totals}>
        <StatTile label="Sets" value={totals.sets} accent={colors.primary} />
        <StatTile label="Full reps" value={totals.fullReps} accent={colors.full} />
        <StatTile label="Partial reps" value={totals.partialReps} accent={colors.partial} />
      </View>
      <Text style={styles.caption}>
        {sessions.length === 1 ? 'Your recorded set' : `Your ${sessions.length} most recent sets`}
      </Text>
      {provenance && <ProvenanceBadge provenance={provenance} />}
    </Card>
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    totals: { flexDirection: 'row', gap: spacing.sm },
    caption: { ...typography.caption, color: colors.textMuted },
  });
