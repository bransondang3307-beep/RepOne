import type { WorkoutSessionSummary } from '@repone/workout-domain';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useWorkoutHistory } from '../src/features/workouts';
import { ProvenanceBadge, colors, spacing } from '../src/shared';

function formatDuration(s: WorkoutSessionSummary): string {
  if (s.ended_at_epoch_ms === null) return 'in progress';
  const seconds = Math.round((s.ended_at_epoch_ms - s.started_at_epoch_ms) / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function HistoryScreen() {
  const { sessions: history, error: historyError } = useWorkoutHistory();

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={history}
      keyExtractor={(s) => s.id}
      ListEmptyComponent={
        <Text style={styles.empty}>{historyError ?? 'No sets recorded yet. Data is stored only on this device.'}</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.title}>{item.machine_label ?? 'Unlabelled set'}</Text>
            <Text style={styles.reps}>
              {item.full_rep_count} full · {item.partial_rep_count} partial
            </Text>
          </View>
          <Text style={styles.meta}>
            {new Date(item.started_at_epoch_ms).toLocaleString()} · {formatDuration(item)}
          </Text>
          <ProvenanceBadge provenance={item.provenance} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, flexShrink: 1 },
  reps: { fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 13, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
