import type { DataProvenance } from '@repone/sensor-contracts';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/tokens';

const LABELS: Record<DataProvenance, string> = {
  simulated: 'Simulated data — not a real measurement',
  replay: 'Replayed recording',
  sensor: 'Live sensor',
};

/** Always shown next to rep counts so synthetic numbers are never mistaken for real ones. */
export function ProvenanceBadge({ provenance }: { provenance: DataProvenance }) {
  return (
    <View style={[styles.badge, provenance !== 'sensor' && styles.warning]}>
      <Text style={[styles.text, provenance !== 'sensor' && styles.warningText]}>{LABELS[provenance]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    backgroundColor: colors.border,
  },
  warning: { backgroundColor: colors.warningBg },
  text: { fontSize: 12, fontWeight: '600', color: colors.text },
  warningText: { color: colors.warningText },
});
