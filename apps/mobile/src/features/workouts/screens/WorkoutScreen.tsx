import { formatResistance, type WorkoutRecord, type WorkoutStatus } from '@repone/workout-domain';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, FadeIn, Icon, PrimaryButton, PressableScale, Screen, useTheme, useThemedStyles, type Theme } from '../../../shared';
import { ExercisePicker, LINEAR_WARNING } from '../components/ExercisePicker';
import { SetRow } from '../components/SetRow';
import { useWorkout } from '../useWorkout';

const STATUS_TEXT: Record<WorkoutStatus, string> = {
  planned: 'Not started',
  active: 'In progress',
  paused: 'Paused',
  finished: 'Finished',
};

/**
 * The workout screen (RO-014 PR 4.2): start a workout, add exercises and sets, record sets with the chosen sensor,
 * pause and resume between sets, and finish. Every rule comes from the domain through the workout controller: the
 * screen only offers what is allowed and shows why an action was refused.
 */
export function WorkoutScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const workout = useWorkout((s) => s.workout);
  const exercises = useWorkout((s) => s.exercises);
  const actionError = useWorkout((s) => s.actionError);
  const actions = useWorkout((s) => s);
  const [picking, setPicking] = useState(false);

  const record = workout.record;
  const status = record?.workout.status ?? null;
  const recordingSet = workout.recordingSetId;
  const editable = record !== null && status !== 'finished';
  const lockedHint = recordingSet !== null ? 'Pause and finish are available between sets.' : null;

  return (
    <Screen
      title="Workout"
      eyebrow={status ? STATUS_TEXT[status] : 'No workout yet'}
      accessory={status === 'finished' ? <Icon name="check" color={colors.fullText} size={22} strokeWidth={2.6} /> : undefined}
    >
      {!record || status === 'finished' ? (
        <FadeIn index={0}>
          <Card title={record ? 'Workout finished' : 'Start a workout'}>
            <Text style={styles.body}>
              {record
                ? 'This workout is finished and read-only. Its sets are in History.'
                : 'Log exercises and sets with the resistance you enter. Sets are recorded with the sensor chosen on Today.'}
            </Text>
            <PrimaryButton label="New workout" icon="plus" onPress={() => void actions.newWorkout()} />
          </Card>
        </FadeIn>
      ) : null}

      {record &&
        record.exercises.map((entry, index) => (
          <FadeIn key={entry.id} index={index + 1}>
            <ExerciseCard record={record} entryId={entry.id} editable={editable} canRecord={status === 'active' && recordingSet === null} />
          </FadeIn>
        ))}

      {editable && !picking && (
        <PrimaryButton label="Add an exercise" icon="plus" tone="secondary" onPress={() => setPicking(true)} />
      )}
      {editable && picking && (
        <ExercisePicker
          exercises={exercises}
          machinesFor={actions.machinesFor}
          onAdd={(exerciseId, machineId) => {
            setPicking(false);
            void actions.addExercise(exerciseId, machineId);
          }}
          onCreate={(input) => {
            setPicking(false);
            void actions.createAndAddExercise(input);
          }}
          onCancel={() => setPicking(false)}
        />
      )}

      {workout.pendingSave && (
        <Card>
          <Text style={styles.error}>A recorded set has not been saved yet.</Text>
          <PrimaryButton label="Try saving again" tone="secondary" onPress={() => void actions.retrySave()} />
        </Card>
      )}

      {status === 'planned' && <PrimaryButton label="Start workout" icon="play" onPress={() => void actions.start()} />}
      {(status === 'active' || status === 'paused') && (
        <View style={styles.controls}>
          {status === 'active' ? (
            <PrimaryButton label="Pause" tone="secondary" disabled={recordingSet !== null} onPress={() => void actions.pause()} />
          ) : (
            <PrimaryButton label="Resume" icon="play" onPress={() => void actions.resume()} />
          )}
          <PrimaryButton label="Finish workout" icon="check" tone="secondary" disabled={recordingSet !== null} onPress={() => void actions.finish()} />
          {lockedHint && <Text style={styles.hint}>{lockedHint}</Text>}
          {status === 'paused' && <Text style={styles.hint}>Resume the workout to record a set.</Text>}
        </View>
      )}

      {(workout.error ?? actionError) && (
        <PressableScale accessibilityRole="button" accessibilityHint="Dismisses the message" onPress={actions.dismissError}>
          <Text style={styles.error}>{actionError ?? workout.error}</Text>
        </PressableScale>
      )}
    </Screen>
  );
}

/** One exercise of the workout with its sets. A top-level component, so typing in a set survives live updates. */
function ExerciseCard({ record, entryId, editable, canRecord }: { record: WorkoutRecord; entryId: string; editable: boolean; canRecord: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const workout = useWorkout((s) => s.workout);
  const live = useWorkout((s) => s.live);
  const exercises = useWorkout((s) => s.exercises);
  const machines = useWorkout((s) => s.machines);
  const lastTime = useWorkout((s) => s.lastTime);
  const outcomes = useWorkout((s) => s.outcomes);
  const defaultUnit = useWorkout((s) => s.defaultUnit);
  const recordSet = useWorkout((s) => s.recordSet);
  const stopSet = useWorkout((s) => s.stopSet);
  const setResistance = useWorkout((s) => s.setResistance);
  const addSet = useWorkout((s) => s.addSet);

  const entry = record.exercises.find((e) => e.id === entryId);
  if (!entry) return null;
  const machine = entry.machine_id ? machines[entry.machine_id] : undefined;
  const name = exercises.find((e) => e.id === entry.exercise_id)?.name ?? 'Exercise';
  const title = [name, machine?.name].filter(Boolean).join(' · ');
  const sets = record.sets.filter((s) => s.workout_exercise_id === entry.id).sort((a, b) => a.position - b.position);
  const last = lastTime[entry.exercise_id];
  const lastText = last?.resistance ? formatResistance(last.resistance) : null;

  return (
    <Card title={title}>
      {machine?.motion_type === 'linear' && <Text style={styles.warning}>{LINEAR_WARNING}</Text>}
      {sets.length === 0 && <Text style={styles.hint}>No sets yet.</Text>}
      {sets.map((set, i) => (
        <SetRow
          key={set.id}
          number={i + 1}
          set={set}
          result={workout.setResults.find((r) => r.set.id === set.id)}
          outcome={set.recording_session_id ? outcomes[set.recording_session_id] : undefined}
          defaultUnit={defaultUnit}
          lastTime={lastText}
          editable={editable}
          canRecord={canRecord}
          live={workout.recordingSetId === set.id ? live : null}
          onRecord={() => void recordSet(set.id)}
          onStop={() => void stopSet()}
          onResistance={(value, unit) => void setResistance(set.id, value, unit)}
        />
      ))}
      {editable && <PrimaryButton label="Add set" icon="plus" tone="secondary" onPress={() => void addSet(entry.id)} />}
    </Card>
  );
}

const makeStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    body: { ...typography.body, color: colors.textMuted },
    controls: { gap: spacing.sm + 4 },
    hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
    warning: { ...typography.label, color: colors.warningText },
    error: { color: colors.danger },
  });
