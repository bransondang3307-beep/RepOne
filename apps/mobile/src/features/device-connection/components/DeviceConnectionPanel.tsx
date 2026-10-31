import type { ConnectionState, DeviceTransport } from '@repone/sensor-contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, PressableScale, PulseDot, useTheme, useThemedStyles, type Theme } from '../../../shared';
import { useDeviceConnection } from '../useDeviceConnection';

const TRANSPORT_LABEL: Record<DeviceTransport, string> = {
  simulated: 'Simulated device',
  usb_serial: 'USB sensor',
  ble: 'Bluetooth sensor',
};

const STATE_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnecting: 'Disconnecting…',
  failed: 'Connection failed',
};

interface Props {
  /** True while a set records (or starts/stops): the connect/disconnect action is disabled. */
  locked?: boolean;
  /** Offer the simulated device's "Simulate connection loss" test control. Default true. */
  showTestControl?: boolean;
}

/**
 * Shows which sensor device the app uses and its connection state, with a connect/disconnect action.
 * `locked` (e.g. while a set is recording) disables that action. For the simulated device only, a clearly
 * labelled test control drops the connection, also mid-set, so the failure path can be checked on a phone.
 */
export function DeviceConnectionPanel({ locked = false, showTestControl = true }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const transport = useDeviceConnection((s) => s.transport);
  const state = useDeviceConnection((s) => s.connectionState);
  const error = useDeviceConnection((s) => s.error);
  const connect = useDeviceConnection((s) => s.connect);
  const disconnect = useDeviceConnection((s) => s.disconnect);
  const canSimulateLoss = useDeviceConnection((s) => s.canSimulateConnectionLoss);
  const simulateLoss = useDeviceConnection((s) => s.simulateConnectionLoss);

  const connected = state === 'connected';
  const transitioning = state === 'connecting' || state === 'disconnecting';
  const disabled = locked || transitioning;
  const stateColor = connected ? colors.success : state === 'failed' ? colors.danger : transitioning ? colors.partial : colors.textMuted;
  const actionLabel = connected ? 'Disconnect' : state === 'failed' ? 'Reconnect' : 'Connect';

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={[styles.iconBubble, connected && styles.iconBubbleOn]}>
          <Icon name="sensor" color={connected ? colors.primaryText : colors.textMuted} size={22} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{TRANSPORT_LABEL[transport]}</Text>
          <View style={styles.stateRow}>
            <PulseDot color={stateColor} active={connected || transitioning} size={8} />
            <Text style={[styles.state, { color: state === 'failed' ? colors.danger : colors.textMuted }]}>
              {STATE_LABEL[state]}
            </Text>
          </View>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${TRANSPORT_LABEL[transport].toLowerCase()}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => void (connected ? disconnect() : connect())}
          style={[styles.action, connected ? styles.actionQuiet : styles.actionStrong, disabled && styles.dimmed]}
        >
          <Text style={[styles.actionLabel, { color: connected ? colors.primaryText : colors.onPrimary }]}>{actionLabel}</Text>
        </PressableScale>
      </View>
      {error && <Text style={styles.reason}>{error.message}</Text>}
      {showTestControl && canSimulateLoss && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Simulate connection loss. Test control, simulated device only."
          accessibilityState={{ disabled: !connected }}
          disabled={!connected}
          onPress={simulateLoss}
          style={({ pressed }) => [styles.testControl, (pressed || !connected) && styles.dimmed]}
        >
          <Icon name="alert" color={colors.warningText} size={18} />
          <View style={styles.text}>
            <Text style={styles.testLabel}>Simulate connection loss</Text>
            <Text style={styles.testCaption}>Test control · simulated device only</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = ({ colors, radius, spacing, typography, elevation }: Theme) =>
  StyleSheet.create({
    panel: { gap: spacing.sm + 4, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...elevation },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    iconBubble: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    iconBubbleOn: { backgroundColor: colors.primarySoft },
    text: { flex: 1, flexShrink: 1 },
    title: { ...typography.label, fontSize: 15, color: colors.text },
    stateRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -6 },
    state: { ...typography.caption, fontSize: 13 },
    reason: { ...typography.caption, color: colors.textMuted },
    action: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill },
    actionStrong: { backgroundColor: colors.primary },
    actionQuiet: { backgroundColor: colors.primarySoft },
    actionLabel: { ...typography.label, fontSize: 13 },
    testControl: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      borderRadius: radius.md - 4,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.warningText,
      backgroundColor: colors.warningBg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    testLabel: { color: colors.warningText, fontWeight: '700', fontSize: 13 },
    testCaption: { color: colors.warningText, fontSize: 11, marginTop: 2 },
    dimmed: { opacity: 0.5 },
  });
