// The native binding, with react-native-ble-mockManager mocked at the module boundary. These tests check the mapping
// (UUID case, bytes, properties, Expo Go detection); they are not evidence of Bluetooth working on a phone.
import { TurboModuleRegistry } from 'react-native';

type Listener = (event: never) => void;
const mockListeners: Record<string, Listener[]> = {};
const mockOn = (name: string) =>
  jest.fn((callback: Listener) => {
    (mockListeners[name] ??= []).push(callback);
    return { remove: () => (mockListeners[name] = mockListeners[name]!.filter((l) => l !== callback)) };
  });
const mockEmit = (name: string, event: unknown) => (mockListeners[name] ?? []).forEach((l) => l(event as never));

const mockManager = {
  start: jest.fn().mockResolvedValue(undefined),
  checkState: jest.fn().mockResolvedValue('on'),
  scan: jest.fn().mockResolvedValue(undefined),
  stopScan: jest.fn().mockResolvedValue(undefined),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  retrieveServices: jest.fn().mockResolvedValue({
    characteristics: [
      { service: '19BC0001-BAB5-4DDB-8E9C-8595137AC300', characteristic: '19BC0002-BAB5-4DDB-8E9C-8595137AC300', properties: { Notify: 'Notify' } },
      { service: '19BC0001-BAB5-4DDB-8E9C-8595137AC300', characteristic: '19BC0003-BAB5-4DDB-8E9C-8595137AC300', properties: { Read: 'Read', Notify: 'Notify' } },
    ],
  }),
  read: jest.fn().mockResolvedValue([1, 2, 3]),
  startNotification: jest.fn().mockResolvedValue(undefined),
  stopNotification: jest.fn().mockResolvedValue(undefined),
  requestMTU: jest.fn().mockResolvedValue(247),
  onDidUpdateState: mockOn('state'),
  onDiscoverPeripheral: mockOn('discover'),
  onDisconnectPeripheral: mockOn('disconnect'),
  onDidUpdateValueForCharacteristic: mockOn('value'),
};
jest.mock('react-native-ble-manager', () => ({ __esModule: true, default: mockManager }));

import { createNativeBleCentral, isNativeBleAvailable } from '../createNativeBleCentral';

describe('createNativeBleCentral', () => {
  const registry = jest.spyOn(TurboModuleRegistry, 'get');
  afterEach(() => registry.mockReset());

  it('is unavailable in Expo Go (no native BLE module), and creates nothing', () => {
    registry.mockReturnValue(null);
    expect(isNativeBleAvailable()).toBe(false);
    expect(createNativeBleCentral()).toBeNull();
  });

  it('maps discovery to lowercase UUIDs and property names, and values to bytes', async () => {
    registry.mockReturnValue({} as never);
    const central = createNativeBleCentral()!;
    expect(await central.prepare()).toBe('on');
    const characteristics = await central.discover('p1');
    expect(characteristics).toEqual([
      { service: '19bc0001-bab5-4ddb-8e9c-8595137ac300', characteristic: '19bc0002-bab5-4ddb-8e9c-8595137ac300', properties: ['notify'] },
      { service: '19bc0001-bab5-4ddb-8e9c-8595137ac300', characteristic: '19bc0003-bab5-4ddb-8e9c-8595137ac300', properties: ['read', 'notify'] },
    ]);
    expect(await central.read('p1', 's', 'c')).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('routes each notification value to its own subscriber only, and stops on stopNotifications', async () => {
    registry.mockReturnValue({} as never);
    const central = createNativeBleCentral()!;
    const a: Uint8Array[] = [];
    const b: Uint8Array[] = [];
    await central.startNotifications('p1', '19bc0001-bab5-4ddb-8e9c-8595137ac300', '19bc0002-bab5-4ddb-8e9c-8595137ac300', (v) => a.push(v));
    await central.startNotifications('p2', '19bc0001-bab5-4ddb-8e9c-8595137ac300', '19bc0002-bab5-4ddb-8e9c-8595137ac300', (v) => b.push(v));
    mockEmit('value', { peripheral: 'p1', service: '19BC0001-BAB5-4DDB-8E9C-8595137AC300', characteristic: '19BC0002-BAB5-4DDB-8E9C-8595137AC300', value: [9] });
    expect(a).toEqual([Uint8Array.from([9])]);
    expect(b).toEqual([]);
    await central.stopNotifications('p1', '19bc0001-bab5-4ddb-8e9c-8595137ac300', '19bc0002-bab5-4ddb-8e9c-8595137ac300');
    mockEmit('value', { peripheral: 'p1', service: '19bc0001-bab5-4ddb-8e9c-8595137ac300', characteristic: '19bc0002-bab5-4ddb-8e9c-8595137ac300', value: [10] });
    expect(a).toHaveLength(1);
  });

  it('waits for the answer to the iOS permission prompt instead of failing on an unknown radio state', async () => {
    registry.mockReturnValue({} as never);
    const central = createNativeBleCentral()!;
    mockManager.checkState.mockResolvedValueOnce('unknown');
    const prepared = central.prepare();
    await new Promise((resolve) => setImmediate(resolve));
    mockEmit('state', { state: 'unknown' });
    mockEmit('state', { state: 'on' });
    await expect(prepared).resolves.toBe('on');
  });

  // Codex round 3 follow-up: the user's time to answer the permission prompt is not the radio's time to settle.
  // Fails on 18bb7b3, which gave up after 5 s whatever the state.
  it('waits for a slow answer to the iOS permission prompt (unknown) far longer than for a radio reset', async () => {
    jest.useFakeTimers();
    try {
      registry.mockReturnValue({} as never);
      const central = createNativeBleCentral()!;
      mockManager.checkState.mockResolvedValueOnce('unknown');
      let result: string | null = null;
      void central.prepare().then((s) => (result = s));
      await jest.advanceTimersByTimeAsync(20_000); // the user is still reading the prompt
      expect(result).toBeNull();
      mockEmit('state', { state: 'on' }); // Allow
      await jest.advanceTimersByTimeAsync(0);
      expect(result).toBe('on');
    } finally {
      jest.useRealTimers();
    }
  });

  // A guard (passes on 18bb7b3 too): both waits are still bounded, and recoverable.
  it('gives up on an unanswered permission prompt after 60 s and on a radio reset after 5 s; the next prepare() asks again', async () => {
    jest.useFakeTimers();
    try {
      registry.mockReturnValue({} as never);
      const central = createNativeBleCentral()!;
      mockManager.checkState.mockResolvedValueOnce('unknown');
      const unanswered = central.prepare();
      await jest.advanceTimersByTimeAsync(60_000);
      await expect(unanswered).resolves.toBe('unknown');
      mockManager.checkState.mockResolvedValueOnce('resetting');
      const resetting = central.prepare();
      await jest.advanceTimersByTimeAsync(5000);
      await expect(resetting).resolves.toBe('resetting');
      await expect(central.prepare()).resolves.toBe('on'); // recovers: nothing was left stuck
    } finally {
      jest.useRealTimers();
    }
  });

  // Codex round 3 on PR #28: fails on 18bb7b3, where the old enable's failure deleted the new link's target.
  it("an older enable that fails late never removes a newer link's notification target", async () => {
    registry.mockReturnValue({} as never);
    const central = createNativeBleCentral()!;
    const service = '19bc0001-bab5-4ddb-8e9c-8595137ac300';
    const samples = '19bc0002-bab5-4ddb-8e9c-8595137ac300';
    let failFirst!: (error: string) => void;
    mockManager.startNotification.mockImplementationOnce(
      () => new Promise<void>((_, reject) => (failFirst = reject)),
    );
    const first = central.startNotifications('p1', service, samples, () => undefined);
    await central.disconnect('p1'); // the link ends; the first enable is still pending in the native module
    const fresh: Uint8Array[] = [];
    await central.startNotifications('p1', service, samples, (v) => fresh.push(v)); // the next link subscribes
    failFirst('Disconnect called before the command completed');
    await expect(first).rejects.toBe('Disconnect called before the command completed');
    mockEmit('value', { peripheral: 'p1', service, characteristic: samples, value: [7] });
    expect(fresh).toEqual([Uint8Array.from([7])]);
  });

  it('retries a failed native start on the next prepare() instead of caching the failure', async () => {
    registry.mockReturnValue({} as never);
    const central = createNativeBleCentral()!;
    mockManager.start.mockRejectedValueOnce('NSBluetoothAlwaysUsageDescription is not set in the infoPlist');
    await expect(central.prepare()).rejects.toBe('NSBluetoothAlwaysUsageDescription is not set in the infoPlist');
    await expect(central.prepare()).resolves.toBe('on');
  });

  it('scans with the service filter and reports the radio state as the OS gives it', async () => {
    registry.mockReturnValue({} as never);
    const central = createNativeBleCentral()!;
    const seen: unknown[] = [];
    await central.startScan(['19bc0001-bab5-4ddb-8e9c-8595137ac300'], (p) => seen.push(p));
    expect(mockManager.scan).toHaveBeenCalledWith(expect.objectContaining({ serviceUUIDs: ['19bc0001-bab5-4ddb-8e9c-8595137ac300'] }));
    mockEmit('discover', { id: 'p9', name: undefined, rssi: -70, advertising: { localName: 'IMU 9' } });
    expect(seen).toEqual([{ id: 'p9', name: 'IMU 9', rssi: -70 }]);
    mockManager.checkState.mockResolvedValueOnce('unauthorized');
    expect(await central.prepare()).toBe('unauthorized');
    const states: string[] = [];
    central.subscribeRadioState((s) => states.push(s));
    mockEmit('state', { state: 'off' });
    expect(states).toEqual(['off']);
  });
});
