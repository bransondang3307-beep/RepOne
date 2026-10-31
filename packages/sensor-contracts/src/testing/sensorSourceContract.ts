import { SensorStartError, type RawSensorSample, type SensorErrorCode, type SensorSource, type SensorStatus } from '../sensor';

export interface SensorSourceHarness {
  readonly source: SensorSource;
  /** Drive the source forward in time (e.g. advance a ManualScheduler). */
  advance(ms: number): void;
}

export interface SensorSourceContractOptions {
  /** The stream ends by itself within 60 s (scripts, replays). Live sources pass `false`. Default `true`. */
  readonly finite?: boolean;
  /** Lowest sample rate the harness produces, Hz. Default 45. */
  readonly minSampleRateHz?: number;
  /** A harness whose source fails while streaming, within 1 s of start(). Enables the mid-stream failure tests. */
  readonly createFailingHarness?: () => SensorSourceHarness;
  /** A harness whose start() cannot begin streaming. Enables the start-failure test. */
  readonly createStartFailureHarness?: () => SensorSourceHarness;
}

const ERROR_CODES: readonly SensorErrorCode[] = ['start_failed', 'connection_lost', 'stream_timeout', 'invalid_data', 'unknown'];

function record(source: SensorSource) {
  const statuses: SensorStatus[] = [];
  const samples: RawSensorSample[] = [];
  source.subscribeStatus((s) => statuses.push(s));
  source.subscribe((s) => samples.push(s));
  return { statuses, samples };
}

/**
 * Shared Jest contract suite. Every SensorSource implementation — simulated,
 * replay, and future USB-serial / BLE adapters — must pass it. Harnesses must be
 * deterministic: two fresh harnesses produce the same stream. The lifecycle is
 * defined in ADR 0007 (see `SensorStatus`).
 */
export function describeSensorSourceContract(
  name: string,
  createHarness: () => SensorSourceHarness,
  options: SensorSourceContractOptions = {},
): void {
  const finite = options.finite ?? true;
  const minSampleRateHz = options.minSampleRateHz ?? 45;

  describe(`SensorSource contract: ${name}`, () => {
    it('starts idle, streams ordered samples, and stops cleanly', async () => {
      const { source, advance } = createHarness();
      const { statuses, samples } = record(source);

      expect(source.getStatus()).toBe('idle');
      expect(source.getLastError()).toBeNull();
      await source.start();
      advance(1000);
      expect(samples.length).toBeGreaterThanOrEqual(minSampleRateHz);
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]!.timestamp_ms).toBeGreaterThanOrEqual(samples[i - 1]!.timestamp_ms);
      }
      await source.stop();
      const count = samples.length;
      advance(1000);
      expect(samples).toHaveLength(count);
      expect(statuses).toEqual(['streaming', 'stopped']);
      expect(source.getLastError()).toBeNull();
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

    it('stops notifying unsubscribed status listeners', async () => {
      const { source, advance } = createHarness();
      const removed = jest.fn();
      const kept = jest.fn();
      source.subscribeStatus(removed)();
      source.subscribeStatus(kept);
      await source.start();
      advance(200);
      await source.stop();
      expect(removed).not.toHaveBeenCalled();
      expect(kept.mock.calls).toEqual([['streaming'], ['stopped']]);
    });

    it('ignores start() while already streaming: no restart, no duplicate stream', async () => {
      const twice = createHarness();
      const once = createHarness();
      const a = record(twice.source);
      const b = record(once.source);
      await twice.source.start();
      await once.source.start();
      twice.advance(500);
      once.advance(500);
      // A second start mid-stream must neither restart the stream (repeating data) nor add a second one.
      await twice.source.start();
      twice.advance(500);
      once.advance(500);
      expect(a.statuses).toEqual(['streaming']);
      expect(a.samples.length).toBeGreaterThan(0);
      expect(a.samples).toEqual(b.samples);
      await twice.source.stop();
      await once.source.stop();
    });

    it('treats stop() as a no-op unless streaming', async () => {
      const { source, advance } = createHarness();
      const { statuses } = record(source);
      await source.stop();
      expect(source.getStatus()).toBe('idle');
      await source.start();
      advance(200);
      await source.stop();
      await source.stop();
      expect(statuses).toEqual(['streaming', 'stopped']);
    });

    if (finite) {
      it('reports itself stopped when a finite stream ends', async () => {
        const { source, advance } = createHarness();
        await source.start();
        advance(60_000);
        expect(source.getStatus()).toBe('stopped');
        expect(source.getLastError()).toBeNull();
      });
    } else {
      it('keeps streaming until stopped', async () => {
        const { source, advance } = createHarness();
        const { samples } = record(source);
        await source.start();
        advance(60_000);
        expect(source.getStatus()).toBe('streaming');
        expect(samples.length).toBeGreaterThanOrEqual(60 * minSampleRateHz);
        await source.stop();
      });
    }

    const { createFailingHarness, createStartFailureHarness } = options;
    if (createFailingHarness) {
      it('enters error with a reason when it fails mid-stream, then delivers nothing', async () => {
        const { source, advance } = createFailingHarness();
        const { statuses, samples } = record(source);
        let errorWhenPublished: unknown = 'not published';
        source.subscribeStatus((s) => {
          if (s === 'error') errorWhenPublished = source.getLastError();
        });

        await source.start();
        advance(1000);
        expect(statuses).toEqual(['streaming', 'error']);
        const error = source.getLastError();
        expect(error).not.toBeNull();
        expect(ERROR_CODES).toContain(error!.code);
        expect(error!.message.length).toBeGreaterThan(0);
        expect(errorWhenPublished).toEqual(error);

        const count = samples.length;
        advance(5000);
        expect(samples).toHaveLength(count);
        await source.stop();
        expect(source.getStatus()).toBe('error');
        expect(source.getLastError()).toEqual(error);
        expect(statuses).toEqual(['streaming', 'error']);
      });
    }

    if (createStartFailureHarness) {
      it('rejects start() with a SensorStartError when it cannot begin streaming', async () => {
        const { source, advance } = createStartFailureHarness();
        const { statuses, samples } = record(source);
        const failure = await source.start().then(
          () => null,
          (e: unknown) => e,
        );
        expect(failure).toBeInstanceOf(SensorStartError);
        expect(source.getStatus()).toBe('error');
        expect(statuses).toEqual(['error']);
        expect((failure as SensorStartError).sensorError).toEqual(source.getLastError());
        expect(ERROR_CODES).toContain(source.getLastError()!.code);
        advance(1000);
        expect(samples).toHaveLength(0);
      });
    }
  });
}
