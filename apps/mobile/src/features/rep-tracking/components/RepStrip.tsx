import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { motion, useReducedMotion, useTheme, useThemedStyles, type Theme } from '../../../shared';
import type { TimelineRep } from '../liveSessionStore';

const MAX_BARS = 24;
const HEIGHT = 64;

/**
 * One bar per detected rep, in order: color = full or partial, height = the rep's peak angular excursion relative
 * to the largest in this set. Algorithm-derived and unvalidated, so it shows no units or absolute values.
 */
export function RepStrip({ reps }: { reps: readonly TimelineRep[] }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const shown = reps.slice(-MAX_BARS);
  const firstNumber = reps.length - shown.length + 1;
  const max = Math.max(...shown.map((r) => r.peakExcursionRad), Number.EPSILON);

  if (reps.length === 0) {
    return <Text style={styles.empty}>Each detected rep appears here as it is counted.</Text>;
  }
  return (
    <View
      style={[styles.strip, { height: HEIGHT }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${reps.length} reps detected: ${reps.filter((r) => r.classification === 'full').length} full, ${reps.filter((r) => r.classification === 'partial').length} partial`}
    >
      {shown.map((rep, i) => (
        <RepBar
          key={firstNumber + i}
          color={rep.classification === 'full' ? colors.full : colors.partial}
          height={Math.max(8, (rep.peakExcursionRad / max) * HEIGHT)}
        />
      ))}
    </View>
  );
}

function RepBar({ color, height }: { color: string; height: number }) {
  const styles = useThemedStyles(makeStyles);
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(grow, {
      toValue: 1,
      duration: motion.base,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
  }, [grow, reduced]);
  return (
    <Animated.View
      style={[styles.bar, { height, backgroundColor: color, transformOrigin: 'bottom', transform: [{ scaleY: grow }] }]}
    />
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    strip: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
    bar: { flex: 1, maxWidth: 14, borderRadius: 4 },
    empty: { ...typography.caption, color: colors.textMuted, paddingVertical: spacing.sm },
  });
