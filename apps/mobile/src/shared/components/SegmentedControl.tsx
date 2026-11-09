import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Theme } from '../theme/theme';
import { PressableScale } from './PressableScale';

interface Props<T extends string> {
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly accessibilityLabel: string;
}

/** A row of mutually exclusive choices, e.g. two views of one list. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.selected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const makeStyles = ({ colors, radius, spacing, typography }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, gap: 4 },
    segment: { flex: 1, alignItems: 'center', borderRadius: radius.pill, paddingVertical: spacing.sm },
    selected: { backgroundColor: colors.surface },
    label: { ...typography.label, color: colors.textMuted },
    labelSelected: { color: colors.text },
  });
