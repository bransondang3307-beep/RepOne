import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, useTheme, type Theme } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `primary`: the main action (purple). `danger`: stopping or destructive. `secondary`: a quieter action. */
  tone?: 'primary' | 'danger' | 'secondary';
  icon?: IconName;
}

export function PrimaryButton({ label, onPress, disabled = false, tone = 'primary', icon }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const background = { primary: colors.primary, danger: colors.danger, secondary: colors.primarySoft }[tone];
  const foreground = { primary: colors.onPrimary, danger: colors.onDanger, secondary: colors.primaryText }[tone];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: background }, tone !== 'secondary' && styles.raised, disabled && styles.disabled]}
    >
      <View style={styles.content}>
        {icon && <Icon name={icon} color={foreground} size={20} />}
        <Text style={[styles.label, { color: foreground }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

const makeStyles = ({ radius, spacing, typography, colors, scheme }: Theme) =>
  StyleSheet.create({
    button: { borderRadius: radius.pill, paddingVertical: spacing.md + 2, paddingHorizontal: spacing.lg },
    raised:
      scheme === 'light'
        ? { shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 }
        : {},
    disabled: { opacity: 0.5 },
    content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    label: { ...typography.heading, fontSize: 17 },
  });
