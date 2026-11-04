import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, type Theme } from '../theme/theme';

/**
 * Padding for a screen's scrolling content. The top includes the status-bar inset, so the first content always
 * starts below it (screens draw their own title instead of a translucent navigation header, RO-028).
 */
export function useScreenContentStyle(): ViewStyle {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  return { ...styles.content, paddingTop: insets.top + 12 };
}

interface HeaderProps {
  title: string;
  /** A short line above the title, e.g. today's date. */
  eyebrow?: string;
  accessory?: ReactNode;
}

/** A screen's large title. */
export function ScreenHeader({ title, eyebrow, accessory }: HeaderProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {accessory}
    </View>
  );
}

interface ScreenProps extends HeaderProps {
  children: ReactNode;
}

/** A scrolling screen with a large title and consistent spacing. */
export function Screen({ children, ...header }: ScreenProps) {
  const contentStyle = useScreenContentStyle();
  return (
    <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
      <ScreenHeader {...header} />
      {children}
    </ScrollView>
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl, gap: spacing.md },
    header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm, paddingBottom: spacing.xs },
    titles: { flexShrink: 1, gap: 2 },
    eyebrow: { ...typography.label, color: colors.textMuted },
    title: { ...typography.title, color: colors.text },
  });
