import { SectionList, StyleSheet, Text, View } from 'react-native';
import { SetCard, groupByDay, totalsOf, useWorkoutHistory } from '../src/features/workouts';
import { Card, FadeIn, ScreenHeader, StatTile, useScreenContentStyle, useTheme, useThemedStyles, type Theme } from '../src/shared';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentStyle = useScreenContentStyle();
  const { sessions, loading, error } = useWorkoutHistory();
  const sections = groupByDay(sessions, Date.now()).map((s) => ({ ...s, data: [...s.data] }));
  const totals = totalsOf(sessions);

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
              <Card>
                <View style={styles.totals}>
                  <StatTile label="Sets" value={totals.sets} accent={colors.primary} />
                  <StatTile label="Full reps" value={totals.fullReps} accent={colors.full} />
                  <StatTile label="Partial reps" value={totals.partialReps} accent={colors.partial} />
                </View>
                <Text style={styles.caption}>
                  {sessions.length === 1 ? 'Your recorded set' : `Your ${sessions.length} most recent sets`}
                </Text>
              </Card>
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
        loading ? null : (
          <Text style={styles.empty}>{error ?? 'No sets recorded yet. Data is stored only on this device.'}</Text>
        )
      }
    />
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    header: { gap: spacing.md },
    totals: { flexDirection: 'row', gap: spacing.sm },
    caption: { ...typography.caption, color: colors.textMuted },
    sectionTitle: { ...typography.heading, color: colors.text, marginTop: spacing.sm },
    empty: { ...typography.body, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
  });
