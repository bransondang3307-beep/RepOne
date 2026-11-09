import { StyleSheet, Text, View } from 'react-native';
import { PopNumber, RingChart, SpinningArc, useTheme, useThemedStyles, type Theme } from '../../../shared';

interface Props {
  fullReps: number;
  partialReps: number;
  recording: boolean;
  size?: number;
}

/**
 * The live set's main graphic. The inner ring splits this set's reps into full (green) and partial (amber); the
 * outer arc circles while recording. Neither is progress toward a goal — the app has no rep targets.
 */
export function LiveRepRing({ fullReps, partialReps, recording, size = 236 }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const total = fullReps + partialReps;
  const inset = 18;

  return (
    <View style={{ width: size, height: size }}>
      <SpinningArc size={size} color={colors.primary} active={recording} />
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <RingChart
          size={size - inset * 2}
          strokeWidth={16}
          trackColor={colors.track}
          rings={[
            {
              segments: [
                { fraction: total ? fullReps / total : 0, color: colors.full },
                { fraction: total ? partialReps / total : 0, color: colors.partial },
              ],
            },
          ]}
          accessibilityLabel={`${fullReps} full reps and ${partialReps} partial reps in this set${recording ? ', recording' : ''}`}
        >
          <PopNumber value={fullReps} style={styles.count} />
          <Text style={styles.countLabel}>full reps</Text>
          <Text style={styles.partial}>
            + {partialReps} partial
          </Text>
        </RingChart>
      </View>
    </View>
  );
}

const makeStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center' },
    count: { ...typography.display, color: colors.text, fontVariant: ['tabular-nums'], lineHeight: 70 },
    countLabel: { ...typography.label, color: colors.textMuted },
    partial: { ...typography.label, color: colors.partial, marginTop: 4, fontVariant: ['tabular-nums'] },
  });
