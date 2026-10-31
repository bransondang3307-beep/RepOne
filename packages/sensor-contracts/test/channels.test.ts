import {
  BaseSensorSource,
  ChannelCollisionError,
  LABELLED_SET_SCRIPT,
  SimulatedDevice,
  combineChannels,
  type DeviceChannel,
  type RawSensorSample,
  type SimulatedChannelSpec,
} from '../src';
import { ManualScheduler } from '../src/testing';
import { BASE_SIMULATION } from './fixtures';

// Synthetic devices only. Each test asks: can two distinct sensors collide within one session?
const spec = (sourceId: string, seed = 42): SimulatedChannelSpec => ({
  script: LABELLED_SET_SCRIPT,
  simulation: { ...BASE_SIMULATION, sourceId, seed },
});

async function connectedDevice(deviceId: string, sourceIds: string[], scheduler: ManualScheduler) {
  const device = new SimulatedDevice({ deviceId, channels: sourceIds.map((id, i) => spec(id, 42 + i)), scheduler });
  await device.connect();
  return device;
}

/** A misbehaving channel source that labels its samples with someone else's source_id. */
class MislabellingSource extends BaseSensorSource {
  constructor(id: string, private readonly sampleSourceId: string) {
    super(id, 'usb_serial', 'sensor');
  }
  async start(): Promise<void> {
    this.setStatus('streaming');
  }
  async stop(): Promise<void> {
    if (this.getStatus() === 'streaming') this.setStatus('stopped');
  }
  push(timestampMs: number): void {
    this.emit({ timestamp_ms: timestampMs, source_id: this.sampleSourceId, accel_m_s2: [0, 0, 9.81], gyro_rad_s: [0, 0, 0], quality_flags: [] });
  }
}

describe('combineChannels', () => {
  it('rejects two devices whose channels share a source_id, before anything is recorded', async () => {
    const scheduler = new ManualScheduler();
    const first = await connectedDevice('device-1', ['imu-a', 'imu-b'], scheduler);
    const second = await connectedDevice('device-2', ['imu-a'], scheduler);
    const attempt = () => combineChannels([...first.getChannels(), ...second.getChannels()]);
    expect(attempt).toThrow(ChannelCollisionError);
    expect(attempt).toThrow(/duplicated: imu-a/);
    expect(scheduler.activeTimers).toBe(0);
  });

  it('rejects the same device combined twice and an empty session', async () => {
    const device = await connectedDevice('device-1', ['imu-a'], new ManualScheduler());
    expect(() => combineChannels([...device.getChannels(), ...device.getChannels()])).toThrow(ChannelCollisionError);
    expect(() => combineChannels([])).toThrow(/at least one sensor channel/);
  });

  it('combines distinct channels from two devices and delivers each sensor\'s samples under its own id', async () => {
    const scheduler = new ManualScheduler();
    const first = await connectedDevice('device-1', ['device-1/imu-1'], scheduler);
    const second = await connectedDevice('device-2', ['device-2/imu-1'], scheduler);
    const session = combineChannels([...first.getChannels(), ...second.getChannels()]);
    expect(session.sourceIds).toEqual(['device-1/imu-1', 'device-2/imu-1']);

    const received: RawSensorSample[] = [];
    const unsubscribe = session.subscribe((s) => received.push(s));
    for (const c of session.channels) await c.source.start();
    scheduler.advance(1000);
    expect(received.filter((s) => s.source_id === 'device-1/imu-1')).toHaveLength(50);
    expect(received.filter((s) => s.source_id === 'device-2/imu-1')).toHaveLength(50);

    unsubscribe();
    scheduler.advance(1000);
    expect(received).toHaveLength(100);
    expect(session.misattributedSampleCounts().size).toBe(0);
  });

  it('drops and counts samples a channel delivers under another sensor\'s source_id', async () => {
    const honest = new MislabellingSource('imu-a', 'imu-a');
    const liar = new MislabellingSource('imu-b', 'imu-a');
    const channels: DeviceChannel[] = [
      { source_id: 'imu-a', source: honest },
      { source_id: 'imu-b', source: liar },
    ];
    const session = combineChannels(channels);
    const received: RawSensorSample[] = [];
    session.subscribe((s) => received.push(s));
    await honest.start();
    await liar.start();
    honest.push(0);
    liar.push(0);
    liar.push(20);
    honest.push(20);

    expect(received.map((s) => s.timestamp_ms)).toEqual([0, 20]);
    expect(received.every((s) => s.source_id === 'imu-a')).toBe(true);
    expect(session.misattributedSampleCounts()).toEqual(new Map([['imu-b', 2]]));
  });
});
