import type { RawSensorSample, SensorSource, SensorStatus } from '../sensor';

export interface SensorSourceHarness {
  readonly source: SensorSource;
  /** Drive the source forward in time (e.g. advance a ManualScheduler). */
  advance(ms: number): void;
}

/**
 * Shared Jest contract suite. Every SensorSource implementation — simulated,
 * replay, and future USB-serial / BLE adapters — must pass it. The harness must
 * produce a finite stream of at least ~1 s of samples at ≥ 45 Hz.
 */
export function describeSensorSourceContract(name: string, createHarness: () => SensorSourceHarness): void {
  describe(`SensorSource contract: ${name}`, () => {
    it('starts idle, streams ordered samples, and stops cleanly', async () => {
      const { source, advance } = createHarness();
      const statuses: SensorStatus[] = [];
      const samples: RawSensorSample[] = [];
      source.subscribeStatus((s) => statuses.push(s));
      source.subscribe((s) => samples.push(s));

      expect(source.getStatus()).toBe('idle');
      await source.start();
      advance(1000);
      expect(samples.length).toBeGreaterThanOrEqual(45);
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]!.timestamp_ms).toBeGreaterThanOrEqual(samples[i - 1]!.timestamp_ms);
      }
      await source.stop();
      const count = samples.length;
      advance(1000);
      expect(samples).toHaveLength(count);
      expect(statuses).toEqual(['streaming', 'stopped']);
    });

    it('stops delivering to unsubscribed listeners', async () => {
      const { source, advance } = createHarness();
      const listener = jest.fn();
      const unsubscribe = source.subscribe(listener);
      await source.start();
      advance(200);
      unsubscribe();
      const calls = listener.mock.calls.length;
      advance(1000);
      expect(listener).toHaveBeenCalledTimes(calls);
      await source.stop();
    });

    it('reports itself stopped when a finite stream ends', async () => {
      const { source, advance } = createHarness();
      await source.start();
      advance(60_000);
      expect(source.getStatus()).toBe('stopped');
    });
  });
}
