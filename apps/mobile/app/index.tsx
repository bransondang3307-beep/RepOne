import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DeviceConnectionPanel } from '../src/features/device-connection';
import { RepCounter, useLiveSession } from '../src/features/rep-tracking';
import { PrimaryButton, ProvenanceBadge, colors, spacing } from '../src/shared';

const STATUS_TEXT = {
  idle: 'Ready',
  starting: 'Starting…',
  recording: 'Recording',
  stopping: 'Saving…',
  finished: 'Set saved',
  error: 'Error',
} as const;

export default function WorkoutScreen() {
  const session = useLiveSession((s) => s.session);
  const startSimulatedSet = useLiveSession((s) => s.startSimulatedSet);
  const stop = useLiveSession((s) => s.stop);
  const dismissResult = useLiveSession((s) => s.dismissResult);
  const [machineLabel, setMachineLabel] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const recording = session.status === 'recording';
  const busy = session.status === 'starting' || session.status === 'stopping';
  const done = session.status === 'finished' || session.status === 'error';

  const run = (action: () => Promise<void>) => {
    setActionError(null);
    action().catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <DeviceConnectionPanel locked={recording || busy} />
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.status}>{STATUS_TEXT[session.status]}</Text>
          <ProvenanceBadge provenance={session.provenance ?? 'simulated'} />
        </View>
        <View style={styles.counters}>
          <RepCounter label="Full reps" value={session.fullReps} emphasis />
          <RepCounter label="Partial" value={session.partialReps} />
        </View>
        <Text style={styles.meta}>
          {session.samplesReceived} samples · algorithm-derived counts, unvalidated on real hardware
        </Text>
      </View>

      {!recording && !busy && !done && (
        <TextInput
          style={styles.input}
          placeholder="Machine / exercise (optional)"
          placeholderTextColor={colors.textMuted}
          value={machineLabel}
          onChangeText={setMachineLabel}
          maxLength={60}
        />
      )}

      {recording || busy ? (
        <PrimaryButton label="Stop set" tone="danger" disabled={busy} onPress={() => run(stop)} />
      ) : done ? (
        <PrimaryButton label="New set" onPress={dismissResult} />
      ) : (
        <PrimaryButton label="Start simulated set" onPress={() => run(() => startSimulatedSet(machineLabel))} />
      )}

      {(session.error ?? actionError) && <Text style={styles.error}>{session.error ?? actionError}</Text>}

      <Link href="/history" style={styles.link}>
        View history
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  // Wraps so the simulated-data badge moves under the status when both don't fit on one line (RO-023).
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  status: { fontSize: 16, fontWeight: '600', color: colors.text, flexShrink: 0 },
  counters: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.md },
  meta: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger },
  link: { color: colors.primary, fontSize: 16, textAlign: 'center', paddingVertical: spacing.sm },
});
