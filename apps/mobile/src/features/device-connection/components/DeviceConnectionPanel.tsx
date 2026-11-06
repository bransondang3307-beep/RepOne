import type { ConnectionState, DeviceTransport } from '@repone/sensor-contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SensorKind } from '../../../application';
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
 * `locked` (e.g. while a set is recording) disables every control. The sensor is always an explicit choice:
 * simulated, or a real Bluetooth sensor found by a scan (RO-029; development build only). For the simulated device
 * only, a clearly labelled test control drops the connection, also mid-set, so the failure path can be checked.
 */
export function DeviceConnectionPanel({ locked = false }: { locked?: boolean }) {
  const transport = useDeviceConnection((s) => s.transport);
  const state = useDeviceConnection((s) => s.connectionState);
  const error = useDeviceConnection((s) => s.error);
  const connect = useDeviceConnection((s) => s.connect);
  const disconnect = useDeviceConnection((s) => s.disconnect);
  const canSimulateLoss = useDeviceConnection((s) => s.canSimulateConnectionLoss);
  const simulateLoss = useDeviceConnection((s) => s.simulateConnectionLoss);

  const sensorKind = useDeviceConnection((s) => s.sensorKind);
  const bleSupport = useDeviceConnection((s) => s.bleSupport);
  const sensorSummary = useDeviceConnection((s) => s.sensorSummary);
  const chooseSimulated = useDeviceConnection((s) => s.chooseSimulated);
  const chooseBle = useDeviceConnection((s) => s.chooseBle);

  const connected = state === 'connected';
  const transitioning = state === 'connecting' || state === 'disconnecting';
  const disabled = locked || transitioning;
  const bleAvailable = bleSupport === 'available';

  return (
    <View style={styles.panel}>
      <View style={styles.choice} accessibilityRole="radiogroup">
        <ChoiceButton label="Simulated" selected={sensorKind === 'simulated'} disabled={locked} onPress={() => void chooseSimulated()} />
        <ChoiceButton
          label="Bluetooth sensor"
          selected={sensorKind === 'ble'}
          disabled={locked || !bleAvailable}
          onPress={() => void chooseBle()}
        />
      </View>
      {!bleAvailable && (
        <Text style={styles.reason}>Real sensors need the development build; Expo Go runs the simulated sensor only.</Text>
      )}
      {sensorKind === 'ble' && <BleSensorPicker locked={locked || transitioning} />}
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.title}>Sensor: {TRANSPORT_LABEL[transport]}</Text>
          <Text style={[styles.state, state === 'failed' && styles.failed]}>{STATE_LABEL[state]}</Text>
          {error && <Text style={styles.reason}>{error.message}</Text>}
          {connected && sensorSummary && <Text style={styles.reason}>{sensorSummary}</Text>}
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
      {canSimulateLoss && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Simulate connection loss. Test control, simulated device only."
          accessibilityState={{ disabled: !connected }}
          disabled={!connected}
          onPress={simulateLoss}
          style={({ pressed }) => [styles.testControl, (pressed || !connected) && styles.dimmed]}
        >
          <Text style={styles.testLabel}>Simulate connection loss</Text>
          <Text style={styles.testCaption}>Test control · simulated device only</Text>
        </Pressable>
      )}
    </View>
  );
}

function ChoiceButton(props: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected, disabled: props.disabled }}
      disabled={props.disabled || props.selected}
      onPress={props.onPress}
      style={[styles.choiceButton, props.selected && styles.choiceSelected, props.disabled && !props.selected && styles.dimmed]}
    >
      <Text style={[styles.choiceLabel, props.selected && styles.choiceLabelSelected]}>{props.label}</Text>
    </Pressable>
  );
}

/** Scan for sensors advertising the protocol's service and pick one. Nothing connects until the user taps Connect. */
function BleSensorPicker({ locked }: { locked: boolean }) {
  const scanning = useDeviceConnection((s) => s.scanning);
  const scanMessage = useDeviceConnection((s) => s.scanMessage);
  const discovered = useDeviceConnection((s) => s.discovered);
  const selected = useDeviceConnection((s) => s.selectedPeripheralId);
  const scan = useDeviceConnection((s) => s.scan);
  const stopScan = useDeviceConnection((s) => s.stopScan);
  const selectSensor = useDeviceConnection((s) => s.selectSensor);

  return (
    <View style={styles.picker}>
      <Pressable
        accessibilityRole="button"
        disabled={locked}
        onPress={() => void (scanning ? stopScan() : scan())}
        style={({ pressed }) => [styles.action, styles.scanAction, (pressed || locked) && styles.dimmed]}
      >
        <Text style={styles.actionLabel}>{scanning ? 'Stop scanning' : 'Scan for sensors'}</Text>
      </Pressable>
      {scanMessage && <Text style={[styles.reason, styles.failed]}>{scanMessage}</Text>}
      {scanning && discovered.length === 0 && <Text style={styles.reason}>Looking for sensors…</Text>}
      {!scanning && !scanMessage && discovered.length === 0 && selected === null && (
        <Text style={styles.reason}>No sensor chosen yet.</Text>
      )}
      {discovered.map((d) => (
        <Pressable
          key={d.peripheralId}
          accessibilityRole="button"
          accessibilityState={{ selected: d.peripheralId === selected, disabled: locked }}
          disabled={locked}
          onPress={() => void selectSensor(d.peripheralId)}
          style={[styles.found, d.peripheralId === selected && styles.foundSelected]}
        >
          <Text style={styles.title}>{d.name}</Text>
          <Text style={styles.reason}>
            {d.rssi} dBm{d.peripheralId === selected ? ' · chosen' : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', gap: spacing.sm },
  choiceButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  choiceLabelSelected: { color: colors.primaryText },
  picker: { gap: spacing.sm },
  scanAction: { alignSelf: 'flex-start' },
  found: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  foundSelected: { borderColor: colors.primary, borderWidth: 1 },
  panel: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, flexShrink: 1 },
  title: { fontSize: 14, fontWeight: '600', color: colors.text },
  state: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  failed: { color: colors.danger },
  reason: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  action: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: colors.primary },
  actionLabel: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  testControl: {
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.warningText,
    backgroundColor: colors.warningBg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  testLabel: { color: colors.warningText, fontWeight: '600', fontSize: 13 },
  testCaption: { color: colors.warningText, fontSize: 11, marginTop: 2 },
  dimmed: { opacity: 0.5 },
});
