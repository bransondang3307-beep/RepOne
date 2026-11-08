import { SectionList, StyleSheet, Text, View } from 'react-native';
import { HistorySummaryCard, SetCard, groupByDay, useWorkoutHistory } from '../src/features/workouts';
import { FadeIn, ScreenHeader, useScreenContentStyle, useThemedStyles, type Theme } from '../src/shared';

export default function HistoryScreen() {
  const styles = useThemedStyles(makeStyles);
  const contentStyle = useScreenContentStyle();
  const { sessions, loading, error } = useWorkoutHistory();
  const sections = groupByDay(sessions, Date.now()).map((s) => ({ ...s, data: [...s.data] }));

  return (
    <SectionList
      contentContainerStyle={contentStyle}
      sections={sections}
      keyExtractor={(s) => s.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <ScreenHeader title="History" eyebrow="Stored only on this device" />
          {sessions.length > 0 && (
            <FadeIn>
              <HistorySummaryCard sessions={sessions} />
            </FadeIn>
          )}
        </View>
      }
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
