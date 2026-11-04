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
  /** True while a set records (or starts/stops): every sensor control is disabled. */
  locked?: boolean;
  /** Offer the simulated device's "Simulate connection loss" test control. Default true. */
  showTestControl?: boolean;
  /**
   * Offer the explicit Simulated / Bluetooth choice and, for Bluetooth, the scan-and-pick list. Default true. The
   * Today screen shows the connection only; the Record screen is where the sensor is chosen.
   */
  showSensorChoice?: boolean;
}

/**
 * Shows which sensor device the app uses and its connection state, with a connect/disconnect action. The sensor is
 * always an explicit choice: simulated, or a real Bluetooth sensor found by a scan (RO-029; development build only).
 * `locked` (e.g. while a set is recording) disables every control. For the simulated device only, a clearly labelled
 * test control drops the connection, also mid-set, so the failure path can be checked on a phone.
 * The semantics are fixed by docs/ui/sensor-connection-interface.md.
 */
export function DeviceConnectionPanel({ locked = false, showTestControl = true, showSensorChoice = true }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
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
  const stateColor = connected ? colors.success : state === 'failed' ? colors.danger : transitioning ? colors.partial : colors.textMuted;
  const actionLabel = connected ? 'Disconnect' : state === 'failed' ? 'Reconnect' : 'Connect';

  return (
    <View style={styles.panel}>
      {showSensorChoice && (
        <>
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
        </>
      )}
      <View style={styles.row}>
        <View style={[styles.iconBubble, connected && styles.iconBubbleOn]}>
          <Icon name="sensor" color={connected ? colors.primaryText : colors.textMuted} size={22} />
        </View>
        <View style={styles.text}>
          {/* RO-029's acceptance checklists rely on "Sensor: <device>". */}
          <Text style={styles.title}>Sensor: {TRANSPORT_LABEL[transport]}</Text>
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
      {connected && sensorSummary && <Text style={styles.reason}>{sensorSummary}</Text>}
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

function ChoiceButton(props: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
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
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const scanning = useDeviceConnection((s) => s.scanning);
  const scanMessage = useDeviceConnection((s) => s.scanMessage);
  const discovered = useDeviceConnection((s) => s.discovered);
  const selected = useDeviceConnection((s) => s.selectedPeripheralId);
  const scan = useDeviceConnection((s) => s.scan);
  const stopScan = useDeviceConnection((s) => s.stopScan);
  const selectSensor = useDeviceConnection((s) => s.selectSensor);
  const scanLabel = scanning ? 'Stop scanning' : 'Scan for sensors';

  return (
    <View style={styles.picker}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={scanLabel}
        accessibilityState={{ disabled: locked }}
        disabled={locked}
        onPress={() => void (scanning ? stopScan() : scan())}
        style={[styles.action, styles.actionQuiet, styles.scanAction, locked && styles.dimmed]}
      >
        <Text style={[styles.actionLabel, { color: colors.primaryText }]}>{scanLabel}</Text>
      </PressableScale>
      {scanMessage && <Text style={[styles.reason, { color: colors.danger }]}>{scanMessage}</Text>}
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
          style={[styles.found, d.peripheralId === selected && styles.foundSelected, locked && styles.dimmed]}
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

const makeStyles = ({ colors, radius, spacing, typography, elevation }: Theme) =>
  StyleSheet.create({
    panel: { gap: spacing.sm + 4, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...elevation },
    choice: { flexDirection: 'row', gap: spacing.xs, padding: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
    choiceButton: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill },
    choiceSelected: { backgroundColor: colors.primary },
    choiceLabel: { ...typography.label, fontSize: 13, color: colors.text },
    choiceLabelSelected: { color: colors.onPrimary },
    picker: { gap: spacing.sm },
    scanAction: { alignSelf: 'flex-start' },
    found: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md - 4,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    foundSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
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
