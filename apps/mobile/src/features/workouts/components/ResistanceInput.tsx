import { MAX_ENTERED_RESISTANCE, resistanceIn, type MassUnit, type Resistance } from '@repone/workout-domain';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PressableScale, useTheme, useThemedStyles, type Theme } from '../../../shared';

interface Props {
  /** The set's stored resistance; null when none was entered. */
  readonly resistance: Resistance | null;
  /** The unit shown when nothing is entered yet (the last unit used, decision 2). */
  readonly defaultUnit: MassUnit;
  /** What was entered the last time this exercise was recorded, e.g. "100 lb". */
  readonly lastTime?: string | null;
  readonly editable?: boolean;
  /** Called with a valid value (or null to clear it) when the field is left or the unit changes. */
  readonly onCommit: (value: number | null, unit: MassUnit) => void;
}

const UNITS: readonly MassUnit[] = ['kg', 'lb'];

const textOf = (resistance: Resistance | null) => (resistance ? String(resistanceIn(resistance)) : '');

/** Parses what the user typed: a number (comma or dot), or nothing. Undefined when it is not a usable weight. */
export function parseResistance(text: string): number | null | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 && value <= MAX_ENTERED_RESISTANCE ? value : undefined;
}

/**
 * A set's resistance, as the user enters it in kg or lb. It is always labelled "entered": the sensor cannot measure
 * resistance (source of truth §1 principle 4).
 */
export function ResistanceInput({ resistance, defaultUnit, lastTime = null, editable = true, onCommit }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [text, setText] = useState(textOf(resistance));
  const [unit, setUnit] = useState<MassUnit>(resistance?.entered_unit ?? defaultUnit);
  const [invalid, setInvalid] = useState(false);

  // A stored change (a prefill, a save from elsewhere) replaces what is shown.
  useEffect(() => {
    setText(textOf(resistance));
    setUnit(resistance?.entered_unit ?? defaultUnit);
    setInvalid(false);
  }, [resistance, defaultUnit]);

  const commit = (nextText: string, nextUnit: MassUnit) => {
    const value = parseResistance(nextText);
    setInvalid(value === undefined);
    if (value === undefined) return;
    const unchanged = value === null ? resistance === null : resistance !== null && resistance.entered_unit === nextUnit && resistanceIn(resistance) === value;
    if (!unchanged) onCommit(value, nextUnit);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>Resistance · entered</Text>
        <TextInput
          style={[styles.input, invalid && styles.inputInvalid]}
          value={text}
          onChangeText={setText}
          onEndEditing={() => commit(text, unit)}
          onSubmitEditing={() => commit(text, unit)}
          editable={editable}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder="—"
          placeholderTextColor={colors.textMuted}
          maxLength={7}
          accessibilityLabel={`Resistance in ${unit}, entered by you`}
        />
        <View style={styles.units} accessibilityRole="radiogroup">
          {UNITS.map((u) => (
            <PressableScale
              key={u}
              accessibilityRole="radio"
              accessibilityState={{ checked: unit === u, disabled: !editable }}
              accessibilityLabel={u === 'kg' ? 'Kilograms' : 'Pounds'}
              disabled={!editable}
              onPress={() => {
                setUnit(u);
                if (text.trim() !== '') commit(text, u);
              }}
              style={[styles.unit, unit === u && styles.unitSelected]}
            >
              <Text style={[styles.unitText, unit === u && styles.unitTextSelected]}>{u}</Text>
            </PressableScale>
          ))}
        </View>
      </View>
      {invalid && <Text style={styles.error}>Enter a weight above 0 and up to {MAX_ENTERED_RESISTANCE}.</Text>}
      {lastTime && <Text style={styles.hint}>Last time: {lastTime}</Text>}
    </View>
  );
}

const makeStyles = ({ colors, radius, spacing, typography }: Theme) =>
  StyleSheet.create({
    wrap: { gap: spacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    label: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
    input: {
      minWidth: 72,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    inputInvalid: { borderWidth: 1, borderColor: colors.danger },
    units: { flexDirection: 'row', gap: spacing.xs },
    unit: { borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 1, backgroundColor: colors.surfaceAlt },
    unitSelected: { backgroundColor: colors.primarySoft },
    unitText: { ...typography.label, color: colors.textMuted },
    unitTextSelected: { color: colors.primaryText },
    error: { ...typography.caption, color: colors.danger },
    hint: { ...typography.caption, color: colors.textMuted },
  });
