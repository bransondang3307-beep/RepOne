import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { DeviceConnectionPanel } from '../src/features/device-connection';
import { useLiveSession } from '../src/features/rep-tracking';
import { SetCard, TodaySummaryCard, WeeklyRepsCard, useWorkoutHistory } from '../src/features/workouts';
import { FadeIn, PrimaryButton, PressableScale, Screen, useThemedStyles, type Theme } from '../src/shared';

/** Enough sets for a week of summaries; the dashboard only aggregates what is stored on this device. */
const DASHBOARD_HISTORY_LIMIT = 500;

export default function TodayScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { sessions, error } = useWorkoutHistory(DASHBOARD_HISTORY_LIMIT);
  const status = useLiveSession((s) => s.session.status);
  const live = status === 'starting' || status === 'recording' || status === 'stopping';
  const nowMs = Date.now();
  const latest = sessions[0];
  const date = new Date(nowMs).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen title="Today" eyebrow={date}>
      <FadeIn index={0}>
        <TodaySummaryCard sessions={sessions} nowMs={nowMs} />
      </FadeIn>

      <FadeIn index={1}>
        <PrimaryButton
          label={live ? 'Back to the live set' : 'Start a set'}
          icon={live ? 'record' : 'play'}
          onPress={() => router.navigate('/record')}
        />
      </FadeIn>

      <FadeIn index={2}>
        <WeeklyRepsCard sessions={sessions} nowMs={nowMs} />
      </FadeIn>

      <FadeIn index={3} style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Sensor
        </Text>
        <DeviceConnectionPanel locked={live} showTestControl={false} />
      </FadeIn>

      {latest && (
        <FadeIn index={4} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Latest set
            </Text>
            <PressableScale accessibilityRole="link" onPress={() => router.navigate('/history')} hitSlop={8}>
              <Text style={styles.link}>See all</Text>
            </PressableScale>
          </View>
          <SetCard set={latest} />
        </FadeIn>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    section: { gap: spacing.sm + 2 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { ...typography.heading, color: colors.text },
    link: { ...typography.label, color: colors.primaryText },
    error: { color: colors.danger },
  });
