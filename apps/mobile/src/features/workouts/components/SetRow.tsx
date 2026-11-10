import type { MassUnit, SessionOutcome, SetResult, WorkoutSet } from '@repone/workout-domain';
import { StyleSheet, Text, View } from 'react-native';
import type { SessionSnapshot } from '../../../application';
import { PrimaryButton, ProvenanceBadge, PulseDot, provenanceLabel, useTheme, useThemedStyles, type Theme } from '../../../shared';
import { ResistanceInput } from './ResistanceInput';

interface Props {
  /** 1-based, as shown. */
  readonly number: number;
  readonly set: WorkoutSet;
  readonly result: SetResult | undefined;
  /** How the set's recording ended, once known. */
  readonly outcome: SessionOutcome | null | undefined;
  readonly defaultUnit: MassUnit;
  readonly lastTime: string | null;
  /** The workout can still change (not finished). */
  readonly editable: boolean;
  /** This planned set may be recorded now: the workout is active and nothing else records. */
  readonly canRecord: boolean;
  /** The recording controller's live snapshot, while this set is the one recording. */
  readonly live: SessionSnapshot | null;
  readonly onRecord: () => void;
  readonly onStop: () => void;
  readonly onResistance: (value: number | null, unit: MassUnit) => void;
}

const STATUS = { planned: 'Planned', recording: 'Recording', completed: 'Completed' } as const;

const ERROR_TEXT: Record<string, string> = {
  connection_lost: 'the sensor connection was lost',
  stream_timeout: 'the sensor stopped sending data',
  invalid_data: 'the sensor sent data that could not be read',
  start_failed: 'the sensor could not start',
  unknown: 'the sensor reported an error',
};

/** Why a completed set's recording ended early, or null when it ended normally (decision 1). */
export function endedEarlyText(outcome: SessionOutcome | null | undefined): string | null {
  if (!outcome) return null;
  switch (outcome.end_reason) {
    case 'sensor_error':
      return `Ended early: ${ERROR_TEXT[outcome.sensor_error_code ?? 'unknown'] ?? ERROR_TEXT.unknown}. The reps saved before that are kept.`;
    case 'start_failed':
      return `The recording could not start: ${ERROR_TEXT[outcome.sensor_error_code ?? 'start_failed'] ?? ERROR_TEXT.start_failed}.`;
    case 'write_failed':
      return 'Ended early: saving the recording failed. What was saved is kept.';
    default:
      return null;
  }
}

/** One set of a workout: its entered resistance, and its reps once recorded. */
export function SetRow({ number, set, result, outcome, defaultUnit, lastTime, editable, canRecord, live, onRecord, onStop, onResistance }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const recording = set.status === 'recording';
  const early = set.status === 'completed' ? endedEarlyText(outcome) : null;
  const statusColor = recording ? colors.danger : set.status === 'completed' ? colors.fullText : colors.textMuted;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Set {number}
        </Text>
        <View style={styles.status}>
          <PulseDot color={statusColor} active={recording} size={7} />
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS[set.status]}</Text>
        </View>
      </View>

      <ResistanceInput
        resistance={set.resistance}
        defaultUnit={defaultUnit}
        lastTime={set.status === 'planned' ? lastTime : null}
        editable={editable}
        onCommit={onResistance}
      />

      {recording && live && (
        // Live counts carry their provenance too (Codex P1 on PR #46): simulated reps are never shown unlabelled.
        <View
          style={styles.result}
          accessible
          accessibilityLabel={`Recording: ${live.fullReps} full reps, ${live.partialReps} partial so far.${live.provenance ? ` ${provenanceLabel(live.provenance)}` : ''}`}
        >
          <Text style={styles.counts}>
            {live.fullReps} full · {live.partialReps} partial so far
          </Text>
          {live.provenance && <ProvenanceBadge provenance={live.provenance} />}
        </View>
      )}

      {set.status === 'completed' && result && (
        <View
          style={styles.result}
          accessible
          accessibilityLabel={`${result.full_rep_count} full reps, ${result.partial_rep_count} partial.${result.provenance ? ` ${provenanceLabel(result.provenance)}` : ''}${early ? ` ${early}` : ''}`}
        >
          <Text style={styles.counts}>
            {result.full_rep_count} full · {result.partial_rep_count} partial
          </Text>
          {result.provenance && <ProvenanceBadge provenance={result.provenance} />}
          {early && <Text style={styles.early}>{early}</Text>}
        </View>
      )}

      {recording ? (
        <PrimaryButton label="Stop set" tone="danger" icon="stop" onPress={onStop} />
      ) : (
        set.status === 'planned' && canRecord && <PrimaryButton label={`Record set ${number}`} icon="play" onPress={onRecord} />
      )}
    </View>
  );
}

const makeStyles = ({ colors, radius, spacing, typography }: Theme) =>
  StyleSheet.create({
    row: { gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md - 4 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { ...typography.label, color: colors.text },
    status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    statusText: { ...typography.caption },
    result: { gap: spacing.xs + 2 },
    counts: { ...typography.heading, color: colors.text, fontVariant: ['tabular-nums'] },
    early: { ...typography.caption, color: colors.danger },
  });
