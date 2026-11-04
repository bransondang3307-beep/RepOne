import * as ReactNative from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { DeviceConnectionState } from '../deviceConnectionStore';

// The panel after the redesign merge (RO-029 × RO-030): it must keep docs/ui/sensor-connection-interface.md's
// semantics. The hook is replaced by a fixed state, so this checks rendering only; the store tests cover behaviour.
let mockState: DeviceConnectionState;
jest.mock('../useDeviceConnection', () => ({
  useDeviceConnection: <T,>(selector: (state: DeviceConnectionState) => T): T => selector(mockState),
}));

import { DeviceConnectionPanel } from '../components/DeviceConnectionPanel';

const noop = async () => undefined;
const baseState = (overrides: Partial<DeviceConnectionState> = {}): DeviceConnectionState =>
  ({
    deviceId: 'simulated-device-01',
    transport: 'simulated',
    connectionState: 'disconnected',
    error: null,
    canSimulateConnectionLoss: true,
    sensorKind: 'simulated',
    bleSupport: 'needs_development_build',
    scanning: false,
    scanMessage: null,
    discovered: [],
    selectedPeripheralId: null,
    sensorSummary: null,
    connect: noop,
    disconnect: noop,
    simulateConnectionLoss: () => undefined,
    chooseSimulated: noop,
    chooseBle: noop,
    scan: noop,
    stopScan: noop,
    selectSensor: noop,
    ...overrides,
  }) as DeviceConnectionState;

const mounted: ReactTestRenderer[] = [];
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(ReactNative.Text).map((n) => [n.props.children].flat().join(''));
const radios = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.type !== 'string' && n.props.onPress)
    .filter((n, i, all) => all.findIndex((m) => m.props.accessibilityState === n.props.accessibilityState) === i)
    .map((n) => ({
      label: [n.findByType(ReactNative.Text).props.children].flat().join(''),
      selected: n.props.accessibilityState.selected as boolean,
      disabled: n.props.accessibilityState.disabled as boolean,
    }));
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label && n.props.onPress);

describe.each(['light', 'dark'] as const)('DeviceConnectionPanel (%s theme)', (scheme) => {
  beforeEach(() => jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => {
    act(() => mounted.splice(0).forEach((t) => t.unmount()));
    jest.restoreAllMocks();
  });

  it('in Expo Go: simulated is chosen, Bluetooth is unavailable and the panel says why', () => {
    mockState = baseState();
    const tree = render(<DeviceConnectionPanel />);
    expect(radios(tree)).toEqual([
      { label: 'Simulated', selected: true, disabled: false },
      { label: 'Bluetooth sensor', selected: false, disabled: true },
    ]);
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        'Real sensors need the development build; Expo Go runs the simulated sensor only.',
        'Sensor: Simulated device',
        'Not connected',
        'Connect',
        'Simulate connection loss',
        'Test control · simulated device only',
      ]),
    );
  });

  it('with Bluetooth chosen: scan, the found sensors, and no test control', () => {
    mockState = baseState({
      transport: 'ble',
      sensorKind: 'ble',
      bleSupport: 'available',
      canSimulateConnectionLoss: false,
      discovered: [{ peripheralId: 'p1', name: 'IMU sensor', rssi: -61 }],
      selectedPeripheralId: 'p1',
    });
    const tree = render(<DeviceConnectionPanel />);
    expect(radios(tree).map((r) => [r.label, r.selected, r.disabled])).toEqual([
      ['Simulated', false, false],
      ['Bluetooth sensor', true, false],
    ]);
    expect(button(tree, 'Scan for sensors').props.disabled).toBe(false);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Sensor: Bluetooth sensor', 'IMU sensor', '-61 dBm · chosen']));
    expect(texts(tree)).not.toContain('Simulate connection loss');
  });

  it("shows a connected sensor's own report, and a failure's message as given", () => {
    mockState = baseState({
      transport: 'ble',
      sensorKind: 'ble',
      bleSupport: 'available',
      canSimulateConnectionLoss: false,
      connectionState: 'connected',
      sensorSummary: 'Sensor 0000a1b2c3d4e5f6 · firmware 0.1 · 50 Hz · 1 IMU',
    });
    expect(texts(render(<DeviceConnectionPanel />))).toEqual(
      expect.arrayContaining(['Connected', 'Disconnect', 'Sensor 0000a1b2c3d4e5f6 · firmware 0.1 · 50 Hz · 1 IMU']),
    );
    mockState = baseState({
      transport: 'ble',
      sensorKind: 'ble',
      bleSupport: 'available',
      connectionState: 'failed',
      error: { code: 'unavailable', message: 'Choose a sensor first: tap Scan, then pick it from the list.' },
    });
    expect(texts(render(<DeviceConnectionPanel />))).toEqual(
      expect.arrayContaining(['Connection failed', 'Reconnect', 'Choose a sensor first: tap Scan, then pick it from the list.']),
    );
  });

  it('locked while recording: the choice, Scan, picking and Connect/Disconnect are all disabled', () => {
    mockState = baseState({
      transport: 'ble',
      sensorKind: 'ble',
      bleSupport: 'available',
      connectionState: 'connected',
      canSimulateConnectionLoss: false,
      discovered: [{ peripheralId: 'p1', name: 'IMU sensor', rssi: -61 }],
      selectedPeripheralId: 'p1',
    });
    const tree = render(<DeviceConnectionPanel locked />);
    expect(radios(tree).every((r) => r.disabled)).toBe(true);
    expect(button(tree, 'Scan for sensors').props.disabled).toBe(true);
    expect(button(tree, 'Disconnect bluetooth sensor').props.disabled).toBe(true);
    const found = tree.root.find((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityState?.selected === true && n.props.onPress);
    expect(found.props.disabled).toBe(true);
  });

  it('the compact variant (Today) shows the connection only: no choice, no scan, no test control', () => {
    mockState = baseState({ sensorKind: 'ble', transport: 'ble', bleSupport: 'available', canSimulateConnectionLoss: false });
    const tree = render(<DeviceConnectionPanel showSensorChoice={false} showTestControl={false} />);
    expect(radios(tree)).toEqual([]);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Scan for sensors')).toEqual([]);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Sensor: Bluetooth sensor', 'Not connected', 'Connect']));
  });
});
