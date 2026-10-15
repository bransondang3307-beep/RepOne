import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/tokens';

export function RepCounter({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <View style={styles.container} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.value, emphasis && styles.emphasis]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  value: { fontSize: 44, fontWeight: '700', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  emphasis: { fontSize: 72, color: colors.text },
  label: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
});
