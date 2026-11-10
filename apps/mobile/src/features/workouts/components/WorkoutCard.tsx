import { activeDurationMs, formatResistance } from '@repone/workout-domain';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Icon, PressableScale, ProvenanceBadge, provenanceLabel, useTheme, useThemedStyles, type Theme } from '../../../shared';
import type { WorkoutListItem } from '../workoutList';
import { endedEarlyText } from './SetRow';

const STATUS_TEXT = { planned: 'Not started', active: 'In progress', paused: 'Paused', finished: 'Finished' } as const;

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 1 ? 'under a minute' : `${m} min`;
}

/** "Mon 9 Nov · 34 min" for a finished workout; the status for one still open. */
export function workoutMeta(item: WorkoutListItem, nowMs: number): string {
  const { workout } = item.summary;
  const at = workout.started_at_epoch_ms ?? workout.created_at_epoch_ms;
  const date = new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return workout.status === 'finished' ? `${date} · ${minutes(activeDurationMs(workout, nowMs))}` : `${date} · ${STATUS_TEXT[workout.status]}`;
}

interface Props {
  readonly item: WorkoutListItem;
  readonly nowMs: number;
  /** Show every set (History's detail); otherwise the card is a summary. */
  readonly expanded?: boolean;
  readonly onPress?: () => void;
}

/**
 * A workout in History or on Today: its exercises, set and rep totals, and the provenance of the least real data in
 * it. Expanded, it lists every set with the resistance entered, its reps, provenance and why it ended early.
 */
export function WorkoutCard({ item, nowMs, expanded = false, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { summary, provenance } = item;
  const title = item.exerciseNames.length > 0 ? item.exerciseNames.join(', ') : 'Workout without exercises';
  const meta = workoutMeta(item, nowMs);
  const totals = `${summary.completed_set_count} of ${summary.set_count} sets recorded · ${summary.full_rep_count} full · ${summary.partial_rep_count} partial`;

  const header = (
    // One accessibility element: its label carries the provenance, so simulated totals are never read without it.
    <View
      style={styles.header}
      accessible
      accessibilityLabel={`${title}. ${meta}. ${totals}.${provenance ? ` ${provenanceLabel(provenance)}` : ''}`}
      accessibilityHint={onPress ? (expanded ? 'Hides the sets' : 'Shows the sets') : undefined}
    >
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
        <Text style={styles.totals}>{totals}</Text>
      </View>
      {onPress && <Icon name="chevron" color={colors.textMuted} size={18} />}
    </View>
  );

  return (
    <Card>
      {onPress ? (
        <PressableScale accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress}>
          {header}
        </PressableScale>
      ) : (
        header
      )}
      {provenance && <ProvenanceBadge provenance={provenance} />}
      {expanded && (
        <View style={styles.sets}>
          {item.sets.length === 0 && <Text style={styles.meta}>No sets.</Text>}
          {item.sets.map(({ result, exerciseTitle, number, outcome }) => {
            const resistance = result.set.resistance ? `${formatResistance(result.set.resistance)} entered` : 'no resistance entered';
            const reps =
              result.set.status === 'completed'
                ? `${result.full_rep_count} full · ${result.partial_rep_count} partial`
                : result.set.status === 'recording'
                  ? `recording: ${result.full_rep_count} full · ${result.partial_rep_count} partial so far`
                  : 'not recorded';
            const early = result.set.status === 'completed' ? endedEarlyText(outcome) : null;
            return (
              <View
                key={result.set.id}
                style={styles.set}
                accessible
                accessibilityLabel={`${exerciseTitle}, set ${number}: ${resistance}, ${reps}.${result.provenance ? ` ${provenanceLabel(result.provenance)}` : ''}${early ? ` ${early}` : ''}`}
              >
                <Text style={styles.setTitle}>
                  {exerciseTitle} · Set {number}
                </Text>
                <Text style={styles.setLine}>
                  {resistance} · {reps}
                </Text>
                {result.provenance && <ProvenanceBadge provenance={result.provenance} />}
                {early && <Text style={styles.early}>{early}</Text>}
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const makeStyles = ({ colors, radius, spacing, typography }: Theme) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    titles: { flex: 1, gap: 2 },
    title: { ...typography.heading, color: colors.text },
    meta: { ...typography.caption, color: colors.textMuted },
    totals: { ...typography.label, color: colors.text, fontVariant: ['tabular-nums'] },
    sets: { gap: spacing.sm },
    set: { gap: spacing.xs, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md - 4 },
    setTitle: { ...typography.label, color: colors.text },
    setLine: { ...typography.caption, color: colors.text },
    early: { ...typography.caption, color: colors.danger },
  });
