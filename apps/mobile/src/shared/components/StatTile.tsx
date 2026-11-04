import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Theme } from '../theme/theme';

interface Props {
  label: string;
  value: string | number;
  /** A colored dot that ties the number to its chart color (e.g. full or partial reps). */
  accent?: string;
}

/** A bold, readable statistic with its label underneath. */
export function StatTile({ label, value, accent }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.number}>{value}</Text>
      <View style={styles.labelRow}>
        {accent && <View style={[styles.dot, { backgroundColor: accent }]} />}
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    tile: { flex: 1, minWidth: 72, gap: 2 },
    number: { ...typography.stat, color: colors.text, fontVariant: ['tabular-nums'] },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    label: { ...typography.caption, color: colors.textMuted },
  });
