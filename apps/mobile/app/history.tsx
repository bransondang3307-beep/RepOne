import { useState } from 'react';
import { FlatList, SectionList, StyleSheet, Text, View } from 'react-native';
import { HistorySummaryCard, SetCard, WorkoutCard, groupByDay, useWorkoutHistory, useWorkoutList } from '../src/features/workouts';
import { FadeIn, ScreenHeader, SegmentedControl, useScreenContentStyle, useThemedStyles, type Theme } from '../src/shared';

type HistoryView = 'workouts' | 'sets';
const VIEWS = [
  { value: 'workouts', label: 'Workouts' },
  { value: 'sets', label: 'All sets' },
] as const;

/**
 * History (RO-014 PR 4.3): workouts with their sets, or every recorded set. "All sets" keeps listing standalone
 * quick sets and recordings made before workouts existed, exactly as before.
 */
export default function HistoryScreen() {
  const styles = useThemedStyles(makeStyles);
  const contentStyle = useScreenContentStyle();
  const { sessions, loading, error } = useWorkoutHistory();
  const workoutList = useWorkoutList();
  const [chosen, setChosen] = useState<HistoryView | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Until the user picks, show workouts when there are any; otherwise the recorded sets.
  const view: HistoryView = chosen ?? (workoutList.workouts.length > 0 ? 'workouts' : 'sets');
  const nowMs = Date.now();

  const header = (
    <View style={styles.header}>
      <ScreenHeader title="History" eyebrow="Stored only on this device" />
      <SegmentedControl options={VIEWS} value={view} onChange={setChosen} accessibilityLabel="History view" />
      {view === 'sets' && sessions.length > 0 && (
        <FadeIn>
          <HistorySummaryCard sessions={sessions} />
        </FadeIn>
      )}
    </View>
  );

  if (view === 'workouts') {
    return (
      <FlatList
        contentContainerStyle={contentStyle}
        data={workoutList.workouts}
        keyExtractor={(item) => item.summary.workout.id}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <FadeIn index={index}>
            <WorkoutCard
              item={item}
              nowMs={nowMs}
              expanded={open === item.summary.workout.id}
              onPress={() => setOpen((current) => (current === item.summary.workout.id ? null : item.summary.workout.id))}
            />
          </FadeIn>
        )}
        ListEmptyComponent={
          workoutList.loading ? undefined : (
            <Text style={styles.empty}>{workoutList.error ?? 'No workouts yet. Start one from Today.'}</Text>
          )
        }
      />
    );
  }

  const sections = groupByDay(sessions, nowMs).map((s) => ({ ...s, data: [...s.data] }));
  return (
    <SectionList
      contentContainerStyle={contentStyle}
      sections={sections}
      keyExtractor={(s) => s.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      renderItem={({ item, index }) => (
        <FadeIn index={index}>
          <SetCard set={item} />
        </FadeIn>
      )}
      ListEmptyComponent={
        loading ? undefined : (
          <Text style={styles.empty}>{error ?? 'No sets recorded yet. Data is stored only on this device.'}</Text>
        )
      }
    />
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    header: { gap: spacing.md },
    sectionTitle: { ...typography.heading, color: colors.text, marginTop: spacing.sm },
    empty: { ...typography.body, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
  });
