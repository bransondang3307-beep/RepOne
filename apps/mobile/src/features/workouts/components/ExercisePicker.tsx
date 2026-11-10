import type { Exercise, Machine, MotionType } from '@repone/workout-domain';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, Icon, PressableScale, PrimaryButton, useTheme, useThemedStyles, type Theme } from '../../../shared';
import type { NewExerciseInput } from '../workoutStore';

/** Shown wherever a linear machine is chosen (RO-014 plan §1.1): the rep detector handles rotation only. */
export const LINEAR_WARNING = 'Rep counting supports rotating machines only';

const MOTIONS: ReadonlyArray<{ readonly value: MotionType; readonly label: string }> = [
  { value: 'rotational', label: 'Rotating' },
  { value: 'linear', label: 'Linear' },
  { value: 'unknown', label: 'Not sure' },
];

interface Props {
  readonly exercises: readonly Exercise[];
  readonly machinesFor: (exerciseId: string) => Promise<Machine[]>;
  readonly onAdd: (exerciseId: string, machineId: string | null) => void;
  readonly onCreate: (input: NewExerciseInput) => void;
  readonly onCancel: () => void;
}

/** Pick an exercise (and one of its machines), or create a new one with an optional machine. */
export function ExercisePicker({ exercises, machinesFor, onAdd, onCreate, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [chosen, setChosen] = useState<Exercise | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [machineName, setMachineName] = useState('');
  const [motion, setMotion] = useState<MotionType>('rotational');
  /** The latest machine lookup: an earlier one that resolves late is ignored (Codex P2 on PR #46). */
  const lookup = useRef(0);

  const choose = (exercise: Exercise) => {
    const request = ++lookup.current;
    setChosen(exercise);
    setMachineId(null);
    setMachines([]);
    machinesFor(exercise.id).then(
      (found) => request === lookup.current && setMachines(found),
      () => request === lookup.current && setMachines([]),
    );
  };

  const chosenMachine = machines.find((m) => m.id === machineId) ?? null;
  const warnExisting = chosenMachine?.motion_type === 'linear';
  const warnNew = machineName.trim() !== '' && motion === 'linear';

  return (
    <Card title="Add an exercise">
      {exercises.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your exercises</Text>
          <View style={styles.chips}>
            {exercises.map((exercise) => (
              <Chip key={exercise.id} label={exercise.name} selected={chosen?.id === exercise.id} onPress={() => choose(exercise)} />
            ))}
          </View>
          {chosen && (
            <>
              <Text style={styles.sectionTitle}>Machine</Text>
              <View style={styles.chips}>
                <Chip label="No machine" selected={machineId === null} onPress={() => setMachineId(null)} />
                {machines.map((machine) => (
                  <Chip key={machine.id} label={machine.name} selected={machineId === machine.id} onPress={() => setMachineId(machine.id)} />
                ))}
              </View>
              {warnExisting && <Warning />}
              <PrimaryButton label={`Add ${chosen.name}`} icon="plus" onPress={() => onAdd(chosen.id, machineId)} />
            </>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>New exercise</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Exercise, e.g. Row"
          placeholderTextColor={colors.textMuted}
          maxLength={80}
          accessibilityLabel="New exercise name"
        />
        <TextInput
          style={styles.input}
          value={machineName}
          onChangeText={setMachineName}
          placeholder="Machine (optional), e.g. Seated row"
          placeholderTextColor={colors.textMuted}
          maxLength={80}
          accessibilityLabel="Machine name, optional"
        />
        {machineName.trim() !== '' && (
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="How the machine moves">
            {MOTIONS.map((m) => (
              <Chip key={m.value} label={m.label} selected={motion === m.value} onPress={() => setMotion(m.value)} radio />
            ))}
          </View>
        )}
        {warnNew && <Warning />}
        <PrimaryButton
          label="Create and add"
          icon="plus"
          tone="secondary"
          disabled={name.trim() === ''}
          onPress={() => onCreate({ name, machine: machineName.trim() === '' ? null : { name: machineName, motionType: motion } })}
        />
      </View>

      <PressableScale accessibilityRole="button" onPress={onCancel} style={styles.cancel} hitSlop={8}>
        <Text style={styles.cancelText}>Cancel</Text>
      </PressableScale>
    </Card>
  );
}

function Chip({ label, selected, onPress, radio = false }: { label: string; selected: boolean; onPress: () => void; radio?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <PressableScale
      accessibilityRole={radio ? 'radio' : 'button'}
      accessibilityState={radio ? { checked: selected } : { selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </PressableScale>
  );
}

function Warning() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.warning} accessible accessibilityRole="alert" accessibilityLabel={LINEAR_WARNING}>
      <Icon name="alert" color={colors.warningText} size={18} />
      <Text style={styles.warningText}>{LINEAR_WARNING}</Text>
    </View>
  );
}

const makeStyles = ({ colors, radius, spacing, typography }: Theme) =>
  StyleSheet.create({
    section: { gap: spacing.sm },
    sectionTitle: { ...typography.label, color: colors.textMuted },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: { borderRadius: radius.pill, paddingHorizontal: spacing.md - 2, paddingVertical: spacing.sm - 1, backgroundColor: colors.surfaceAlt },
    chipSelected: { backgroundColor: colors.primarySoft },
    chipText: { ...typography.label, color: colors.text },
    chipTextSelected: { color: colors.primaryText },
    input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md - 4, fontSize: 16, color: colors.text },
    warning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.warningBg, borderRadius: radius.sm, padding: spacing.sm + 2 },
    warningText: { ...typography.label, color: colors.warningText, flexShrink: 1 },
    cancel: { alignSelf: 'center', paddingVertical: spacing.xs },
    cancelText: { ...typography.label, color: colors.primaryText },
  });
