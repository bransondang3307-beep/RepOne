import type { WorkoutSessionSummary } from '@repone/workout-domain';
import { StyleSheet, Text, View } from 'react-native';
import { ProvenanceBadge, useThemedStyles, type Theme } from '../../../shared';
import { formatDuration } from '../historyStats';

/** One recorded set in History: its rep counts, label, time, duration and data provenance. */
export function SetCard({ set }: { set: WorkoutSessionSummary }) {
  const styles = useThemedStyles(makeStyles);
  const time = new Date(set.started_at_epoch_ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${set.machine_label ?? 'Unlabelled set'}: ${set.full_rep_count} full reps, ${set.partial_rep_count} partial, at ${time}, ${formatDuration(set)}`}
    >
      <View style={styles.row}>
        <View style={styles.repBubble}>
          <Text style={styles.repCount}>{set.full_rep_count}</Text>
          <Text style={styles.repLabel}>full</Text>
        </View>
        <View style={styles.details}>
          <Text style={styles.title} numberOfLines={2}>
            {set.machine_label ?? 'Unlabelled set'}
          </Text>
          <Text style={styles.meta}>
            {time} · {formatDuration(set)}
          </Text>
          <View style={styles.partialChip}>
            <View style={styles.partialDot} />
            <Text style={styles.partialText}>{set.partial_rep_count} partial</Text>
          </View>
        </View>
      </View>
      <ProvenanceBadge provenance={set.provenance} />
    </View>
  );
}

const makeStyles = ({ colors, radius, spacing, typography, elevation }: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm + 4, ...elevation },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    repBubble: {
      width: 64,
      height: 64,
      borderRadius: radius.md + 4,
      backgroundColor: colors.fullSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    repCount: { ...typography.stat, fontSize: 26, color: colors.fullText, fontVariant: ['tabular-nums'] },
    repLabel: { ...typography.caption, fontSize: 11, color: colors.fullText, marginTop: -2 },
    details: { flex: 1, gap: 3 },
    title: { ...typography.heading, fontSize: 16, color: colors.text },
    meta: { ...typography.caption, color: colors.textMuted },
    partialChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    partialDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.partial },
    partialText: { ...typography.caption, color: colors.text, fontVariant: ['tabular-nums'] },
  });
