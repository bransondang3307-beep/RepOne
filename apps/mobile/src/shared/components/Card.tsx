import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemedStyles, type Theme } from '../theme/theme';

interface Props {
  children: ReactNode;
  /** Optional heading row: a title, with an accessory (e.g. a link or badge) on the right. */
  title?: string;
  accessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** The app's basic surface: rounded, padded, with subtle depth. */
export function Card({ children, title, accessory, style }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.card, style]}>
      {(title || accessory) && (
        <View style={styles.header}>
          {title && (
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
          )}
          {accessory}
        </View>
      )}
      {children}
    </View>
  );
}

const makeStyles = ({ colors, radius, spacing, typography, elevation }: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md + 4, gap: spacing.md, ...elevation },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
    title: { ...typography.heading, color: colors.text, flexShrink: 1 },
  });
