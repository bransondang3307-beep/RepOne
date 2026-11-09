import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { motion, useReducedMotion } from '../motion';
import { useThemedStyles, type Theme } from '../theme/theme';

export interface BarDatum {
  readonly key: string;
  /** Short axis label under the bar (e.g. a weekday). */
  readonly label: string;
  /** Stacked from the bottom up. */
  readonly segments: readonly { readonly amount: number; readonly color: string }[];
  /** Emphasised (e.g. today): its label is drawn in the primary color. */
  readonly highlight?: boolean;
}

interface Props {
  data: readonly BarDatum[];
  height?: number;
  /** For screen readers: the chart's numbers as a sentence. */
  accessibilityLabel: string;
}

const MIN_VISIBLE_PX = 4;

/** Vertical stacked bars that grow in from the bottom. Bars are scaled to the largest total in `data`. */
export function BarChart({ data, height = 132, accessibilityLabel }: Props) {
  const styles = useThemedStyles(makeStyles);
  const totals = data.map((d) => d.segments.reduce((sum, s) => sum + Math.max(0, s.amount), 0));
  const max = Math.max(1, ...totals);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.chart}>
      {data.map((d, i) => (
        <View key={d.key} style={styles.column}>
          <Text style={styles.total}>{totals[i]! > 0 ? totals[i] : ''}</Text>
          <View style={[styles.slot, { height }]}>
            <GrowingBar index={i} heightPx={(totals[i]! / max) * height}>
              {d.segments.map((s, j) =>
                s.amount > 0 ? (
                  <View
                    key={j}
                    style={{
                      backgroundColor: s.color,
                      flexGrow: s.amount,
                      minHeight: MIN_VISIBLE_PX,
                    }}
                  />
                ) : null,
              ).reverse()}
            </GrowingBar>
          </View>
          <Text style={[styles.label, d.highlight && styles.highlight]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function GrowingBar({ heightPx, index, children }: { heightPx: number; index: number; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      grow.setValue(1);
      return;
    }
    grow.setValue(0);
    const animation = Animated.timing(grow, {
      toValue: 1,
      duration: motion.slow,
      delay: index * motion.stagger,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [grow, heightPx, index, reduced]);

  if (heightPx <= 0) return <View style={styles.emptyBar} />;
  return (
    <Animated.View
      style={[
        styles.bar,
        { height: Math.max(heightPx, MIN_VISIBLE_PX), transformOrigin: 'bottom', transform: [{ scaleY: grow }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    column: { flex: 1, alignItems: 'center', gap: spacing.xs + 2 },
    total: { ...typography.caption, color: colors.textMuted, fontVariant: ['tabular-nums'], minHeight: 16 },
    slot: { width: '100%', maxWidth: 30, justifyContent: 'flex-end' },
    bar: { width: '100%', borderRadius: 8, overflow: 'hidden', flexDirection: 'column' },
    emptyBar: { width: '100%', height: MIN_VISIBLE_PX, borderRadius: 2, backgroundColor: colors.track },
    label: { ...typography.caption, color: colors.textMuted },
    highlight: { color: colors.primaryText, fontWeight: '800' },
  });
