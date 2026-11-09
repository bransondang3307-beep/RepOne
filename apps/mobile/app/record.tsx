import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { DeviceConnectionPanel } from '../src/features/device-connection';
import { LiveRepRing, RepStrip, useElapsed, useLiveSession } from '../src/features/rep-tracking';
import {
  Card,
  FadeIn,
  Icon,
  PrimaryButton,
  ProvenanceBadge,
  PulseDot,
  Screen,
  StatTile,
  useTheme,
  useThemedStyles,
  type Theme,
} from '../src/shared';

const STATUS_TEXT = {
  idle: 'Ready',
  starting: 'Starting…',
  recording: 'Recording',
  stopping: 'Saving…',
  finished: 'Set saved',
  error: 'Error',
} as const;

export default function RecordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const session = useLiveSession((s) => s.session);
  const repTimeline = useLiveSession((s) => s.repTimeline);
  const startedAt = useLiveSession((s) => s.recordingStartedAtMs);
  const startSimulatedSet = useLiveSession((s) => s.startSimulatedSet);
  const stop = useLiveSession((s) => s.stop);
  const dismissResult = useLiveSession((s) => s.dismissResult);
  const [machineLabel, setMachineLabel] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const recording = session.status === 'recording';
  const busy = session.status === 'starting' || session.status === 'stopping';
  const done = session.status === 'finished' || session.status === 'error';
  const elapsed = useElapsed(startedAt, recording);
  const statusColor =
    session.status === 'error' ? colors.danger : recording ? colors.danger : session.status === 'finished' ? colors.fullText : colors.textMuted;

  const run = (action: () => Promise<void>) => {
    setActionError(null);
    action().catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <Screen
      title="Record"
      eyebrow="Live set"
      accessory={
        <View style={styles.status} accessible accessibilityLabel={`Status: ${STATUS_TEXT[session.status]}`}>
          <PulseDot color={statusColor} active={recording} size={8} />
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_TEXT[session.status]}</Text>
        </View>
      }
    >
      <FadeIn index={0}>
        <DeviceConnectionPanel locked={recording || busy} />
      </FadeIn>

      <FadeIn index={1}>
        <Card>
          <View style={styles.ring}>
            <LiveRepRing fullReps={session.fullReps} partialReps={session.partialReps} recording={recording} />
          </View>
          <View style={styles.stats}>
            <StatTile label="Elapsed" value={elapsed} />
            <StatTile label="Samples" value={session.samplesReceived} />
            <StatTile label="All reps" value={session.fullReps + session.partialReps} />
          </View>
          <ProvenanceBadge provenance={session.provenance ?? 'simulated'} />
          <Text style={styles.meta}>Algorithm-derived counts, unvalidated on real hardware.</Text>
        </Card>
      </FadeIn>

      <FadeIn index={2}>
        <Card title="Reps this set">
          <RepStrip reps={repTimeline} />
        </Card>
      </FadeIn>

      {!recording && !busy && !done && (
        <FadeIn index={3}>
          <TextInput
            style={styles.input}
            placeholder="Machine / exercise (optional)"
            placeholderTextColor={colors.textMuted}
            value={machineLabel}
            onChangeText={setMachineLabel}
            maxLength={60}
            accessibilityLabel="Machine or exercise label, optional"
          />
        </FadeIn>
      )}

      {recording || busy ? (
        <PrimaryButton label="Stop set" tone="danger" icon="stop" disabled={busy} onPress={() => run(stop)} />
      ) : done ? (
        <View style={styles.doneActions}>
          {session.status === 'finished' && (
            <View style={styles.saved}>
              <Icon name="check" color={colors.fullText} size={20} strokeWidth={2.6} />
              <Text style={styles.savedText}>Saved to History on this device</Text>
            </View>
          )}
          <PrimaryButton label="New set" icon="plus" onPress={dismissResult} />
          <PrimaryButton label="View history" tone="secondary" onPress={() => router.navigate('/history')} />
        </View>
      ) : (
        <PrimaryButton label="Start simulated set" icon="play" onPress={() => run(() => startSimulatedSet(machineLabel))} />
      )}

      {(session.error ?? actionError) && <Text style={styles.error}>{session.error ?? actionError}</Text>}
    </Screen>
  );
}

const makeStyles = ({ colors, radius, spacing, typography, elevation }: Theme) =>
  StyleSheet.create({
    status: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
    statusText: { ...typography.label },
    ring: { alignItems: 'center', paddingVertical: spacing.sm },
    stats: { flexDirection: 'row', gap: spacing.sm },
    meta: { ...typography.caption, color: colors.textMuted },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      fontSize: 16,
      color: colors.text,
      ...elevation,
    },
    doneActions: { gap: spacing.sm + 4 },
    saved: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    savedText: { ...typography.label, color: colors.fullText },
    error: { color: colors.danger },
  });
