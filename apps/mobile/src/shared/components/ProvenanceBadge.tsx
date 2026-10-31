import type { DataProvenance } from '@repone/sensor-contracts';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Theme } from '../theme/theme';

const LABELS: Record<DataProvenance, string> = {
  simulated: 'Simulated data — not a real measurement',
  replay: 'Replayed recording',
  sensor: 'Live sensor',
};

/**
 * Always shown next to rep counts so synthetic numbers are never mistaken for real ones. The whole label must
 * stay readable: in a narrow row the badge shrinks to the space available and its text wraps; it never truncates.
 */
export function ProvenanceBadge({ provenance }: { provenance: DataProvenance }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.badge, provenance !== 'sensor' && styles.warning]}>
      <Text style={[styles.text, provenance !== 'sensor' && styles.warningText]}>{LABELS[provenance]}</Text>
    </View>
  );
}

const makeStyles = ({ colors, spacing }: Theme) =>
  StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      flexShrink: 1,
      maxWidth: '100%',
      // A rounded rectangle still reads as a badge when the label wraps to two lines (a pill would not).
      borderRadius: 10,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
      backgroundColor: colors.fullSoft,
    },
    warning: { backgroundColor: colors.warningBg },
    text: { fontSize: 12, fontWeight: '700', color: colors.fullText },
    warningText: { color: colors.warningText },
  });
