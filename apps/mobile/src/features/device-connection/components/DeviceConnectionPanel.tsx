import type { ConnectionState, DeviceTransport } from '@repone/sensor-contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../../shared';
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

/**
 * Shows which sensor device the app uses and its connection state, with a connect/disconnect action.
 * `locked` (e.g. while a set is recording) disables the action.
 */
export function DeviceConnectionPanel({ locked = false }: { locked?: boolean }) {
  const transport = useDeviceConnection((s) => s.transport);
  const state = useDeviceConnection((s) => s.connectionState);
  const error = useDeviceConnection((s) => s.error);
  const connect = useDeviceConnection((s) => s.connect);
  const disconnect = useDeviceConnection((s) => s.disconnect);

  const connected = state === 'connected';
  const transitioning = state === 'connecting' || state === 'disconnecting';
  const disabled = locked || transitioning;

  return (
    <View style={styles.panel}>
      <View style={styles.text}>
        <Text style={styles.title}>Sensor: {TRANSPORT_LABEL[transport]}</Text>
        <Text style={[styles.state, state === 'failed' && styles.failed]}>{STATE_LABEL[state]}</Text>
        {error && <Text style={styles.reason}>{error.message}</Text>}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => void (connected ? disconnect() : connect())}
        style={({ pressed }) => [styles.action, (pressed || disabled) && styles.dimmed]}
      >
        <Text style={styles.actionLabel}>{connected ? 'Disconnect' : state === 'failed' ? 'Reconnect' : 'Connect'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  text: { flex: 1, flexShrink: 1 },
  title: { fontSize: 14, fontWeight: '600', color: colors.text },
  state: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  failed: { color: colors.danger },
  reason: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  action: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: colors.primary },
  actionLabel: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  dimmed: { opacity: 0.5 },
});
