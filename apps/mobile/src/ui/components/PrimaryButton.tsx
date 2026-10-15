import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../theme/tokens';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'danger';
}

export function PrimaryButton({ label, onPress, disabled = false, tone = 'primary' }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tone === 'danger' ? colors.danger : colors.primary },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 12, paddingVertical: spacing.md, alignItems: 'center' },
  dimmed: { opacity: 0.6 },
  label: { color: colors.primaryText, fontSize: 17, fontWeight: '600' },
});
