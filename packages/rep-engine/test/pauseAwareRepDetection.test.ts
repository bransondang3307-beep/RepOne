/**
 * RO-032 / ADR 0009 regression suite. Every trace is SYNTHETIC (scripted trajectory, `synthetic` sample flag);
 * passing here says nothing about accuracy on real hardware.
 */
import type { MotionDetector, RawSensorSample, RepEvent } from '@repone/sensor-contracts';
import { DETECTOR_QUALITY_FLAGS, RotationalRepDetector } from '../src';
import { LegacyRotationalRepDetector } from './reference/LegacyRotationalRepDetector';
import { BASE_OPTIONS, SCENARIOS, withoutPauses, type Scenario } from './scenarios/catalog';
import { SCENARIO_CALIBRATION, checkScenario, runScenario, timingToleranceMs, type DetectorFactory } from './scenarios/check';
import { cycle, generateScenario, hold, move } from './scenarios/trajectory';

const scenario = (name: string): Scenario => {
  const found = SCENARIOS.find((s) => s.name === name);
  if (!found) throw new Error(`unknown scenario ${name}`);
  return found;
};

const OWNER_CASE = 'owner case: upward, pause midway, continue upward, complete';

describe('pause-aware rep detection — synthetic scenarios with ground truth', () => {
  it.each(SCENARIOS.map((s) => [s.name, s] as const))('%s', (_name, sc) => {
    expect(checkScenario(sc, runScenario(sc))).toEqual([]);
  });

  it('owner case: exactly one full rep, completing at the true return and starting at the true outward crossing', () => {
    const run = runScenario(scenario(OWNER_CASE));
    expect(run.events).toHaveLength(1);
    const [event] = run.events;
    const [label] = run.trace.cycles;
    expect(event!.classification).toBe('full');
    expect(Math.abs(event!.timestamp_ms - label!.trueReturnMs(0.1))).toBeLessThanOrEqual(timingToleranceMs(50));
    // The pause (2100–3600 ms) and the renewed upward acceleration after it produce no event.
    expect(event!.timestamp_ms).toBeGreaterThan(label!.trueReturnMs(0.1) - 60);
    expect(event!.peak_excursion_rad / SCENARIO_CALIBRATION.full_rom_rad).toBeGreaterThan(0.95);
  });
});

describe('invariant: adding a pause to an otherwise equivalent movement never adds a rep', () => {
  const paused = SCENARIOS.filter((s) => s.script.some((i) => i.kind === 'cycle' && i.steps.some((st) => st.kind === 'hold')));

  it('applies to a meaningful number of scenarios', () => {
    expect(paused.length).toBeGreaterThanOrEqual(8);
  });

  it.each(paused.map((s) => [s.name, s] as const))('%s', (_name, sc) => {
    const withPause = runScenario(sc).events.map((e) => e.classification);
    const twin = runScenario({ ...sc, script: withoutPauses(sc.script) }).events.map((e) => e.classification);
    expect(withPause).toEqual(twin);
  });

  it('holds for pauses of every length from 0.3 s to 30 s at the midpoint of the outward phase', () => {
    for (const pauseMs of [300, 700, 1500, 4000, 9000, 12_000, 30_000]) {
      const sc: Scenario = {
        name: `pause ${pauseMs}`,
        script: [hold(1500), cycle('full', move(0.5, 600), hold(pauseMs), move(1, 600), move(0, 1200)), hold(1500)],
        expected: ['full'],
      };
      expect({ pauseMs, violations: checkScenario(sc, runScenario(sc)) }).toEqual({ pauseMs, violations: [] });
    }
  });
});

describe('sampling rate, irregular timing and orientation', () => {
  const RATE_SCENARIOS = [OWNER_CASE, 'multiple pauses in one cycle (outward and return)', 'long pause (15 s) midway, then continuation'];

  it.each([25, 50, 100, 200])('equivalent traces at %i Hz give the same events, timed to the true trajectory', (rate) => {
    for (const name of RATE_SCENARIOS) {
      const sc = scenario(name);
      expect({ name, rate, violations: checkScenario(sc, runScenario(sc, undefined, { sampleRateHz: rate })) }).toEqual({
        name,
        rate,
        violations: [],
      });
    }
  });

  it.each([
    ['x axis, flipped mount', { axis: 0 as const, mountFlipped: true }],
    ['y axis', { axis: 1 as const }],
    ['y axis, flipped mount', { axis: 1 as const, mountFlipped: true }],
    ['z axis (vertical: gravity unobservable)', { axis: 2 as const }],
    ['z axis, flipped mount', { axis: 2 as const, mountFlipped: true }],
  ])('%s: every scenario still passes', (_label, overrides) => {
    for (const sc of SCENARIOS) {
      // A disconnect cannot be re-anchored without gravity (z axis); that case is covered separately below.
      if (overrides.axis === 2 && sc.unfinished?.some((u) => u.outcome === 'interrupted')) continue;
      expect({ name: sc.name, violations: checkScenario(sc, runScenario(sc, undefined, overrides)) }).toEqual({
        name: sc.name,
        violations: [],
      });
    }
  });

  it('gives the same events across noise seeds (synthetic seed sweep)', () => {
    for (const sc of SCENARIOS) {
      for (let seed = 1; seed <= 5; seed++) {
        expect({ name: sc.name, seed, violations: checkScenario(sc, runScenario(sc, undefined, { seed })) }).toEqual({
          name: sc.name,
          seed,
          violations: [],
        });
      }
    }
  });
});

describe('gravity reference at rest (ADR 0009 §3)', () => {
  const LONG = scenario('long pause (15 s) midway, then continuation');
  // An uncalibrated residual gyro offset of 0.02 rad/s drifts ~0.3 rad (~25 % ROM) over the 15 s pause.
  const drifting = { gyroBiasRadS: [0.02, 0, 0] as const };

  it('corrects gyro drift during a long mid-cycle pause', () => {
    expect(checkScenario(LONG, runScenario(LONG, undefined, drifting))).toEqual([]);
  });

  it('negative control: with the gravity reference disabled the same drift breaks the cycle', () => {
    const noGravity: DetectorFactory = (cal) => new RotationalRepDetector('s', cal, { minGravityPlaneFraction: 2 });
    expect(checkScenario(LONG, runScenario(LONG, noGravity, drifting)).length).toBeGreaterThan(0);
  });

  it('re-anchors after a disconnect at the top instead of assuming the rest position is the start', () => {
    const sc = scenario('disconnect mid-cycle: that cycle is interrupted, the rest are timed correctly');
    const run = runScenario(sc);
    expect(checkScenario(sc, run)).toEqual([]);
    expect(run.unfinished).toEqual([
      expect.objectContaining({ outcome: 'interrupted', reason: 'sample_gap', last_timestamp_ms: 4980 }),
    ]);
    expect(run.events.flatMap((e) => e.quality_flags)).not.toContain(DETECTOR_QUALITY_FLAGS.referenceAssumed);
  });

  it.each([false, true])(
    'resolves the side of start after a gap with no cycle observed yet (mount flipped: %s)',
    (mountFlipped) => {
      // The lever is lifted to the top during a 1.3 s dropout that starts before any cycle; nothing hints at the side.
      const script = [hold(1500), cycle('full', move(1, 1000), hold(2500), move(0, 1000)), hold(1000)];
      const later = [cycle('full', move(1, 1000), move(0, 1000)), hold(1000), cycle('full', move(1, 1000), move(0, 1000)), hold(1500)];
      const trace = generateScenario([...script, ...later], { ...BASE_OPTIONS, mountFlipped, dropouts: [[1400, 2700]] });
      const detector = new RotationalRepDetector('s', SCENARIO_CALIBRATION);
      const events = runSamples(detector, trace.samples);
      expect(events.map((e) => e.classification)).toEqual(['full', 'full']);
      trace.cycles.slice(1).forEach((label, i) => {
        expect(Math.abs(events[i]!.timestamp_ms - label.trueReturnMs(0.1))).toBeLessThanOrEqual(timingToleranceMs(50));
      });
      // No cycle was in progress when the gap began, so nothing is reported as interrupted.
      expect(detector.finish()).toEqual([]);
    },
  );

  it('documents a limitation: without gravity (vertical axis) a disconnect at the top shifts later reps by half a cycle', () => {
    const sc = scenario('disconnect mid-cycle: that cycle is interrupted, the rest are timed correctly');
    const run = runScenario(sc, undefined, { axis: 2 });
    const violations = checkScenario(sc, run);
    expect(violations.length).toBeGreaterThan(0);
    // …but the detector says so: the next cycle carries `reference_assumed`.
    expect(run.events[1]?.quality_flags).toContain(DETECTOR_QUALITY_FLAGS.referenceAssumed);
  });

  it('flags a mid-cycle rest whose gravity angle disagrees with the gyro, and keeps the gyro angle', () => {
    const trace = generateScenario(
      [hold(1500), cycle('full', move(0.5, 600), hold(2000), move(1, 600), move(0, 1200)), hold(1500)],
      BASE_OPTIONS,
    );
    // Corrupt the accelerometer during the pause only (e.g. a knock or a slipping mount).
    const samples = trace.samples.map((s) =>
      s.timestamp_ms > 2200 && s.timestamp_ms < 3500
        ? { ...s, accel_m_s2: [s.accel_m_s2[0], -s.accel_m_s2[1], -s.accel_m_s2[2]] as const }
        : s,
    );
    const events = runSamples(new RotationalRepDetector('s', SCENARIO_CALIBRATION), samples);
    expect(events.map((e) => e.classification)).toEqual(['full']);
    expect(events[0]!.quality_flags).toContain(DETECTOR_QUALITY_FLAGS.gravityDisagreement);
  });
});

describe('sensor limitations: acceleration alone never counts a rep', () => {
  it('ignores accelerometer bursts with no rotation (zero gyro): no events', () => {
    const trace = generateScenario([hold(10_000)], BASE_OPTIONS);
    const samples = trace.samples.map((s, i) =>
      i % 50 < 10 ? { ...s, accel_m_s2: [s.accel_m_s2[0] + 6, s.accel_m_s2[1] - 4, s.accel_m_s2[2] + 8] as const } : s,
    );
    expect(runSamples(new RotationalRepDetector('s', SCENARIO_CALIBRATION), samples)).toEqual([]);
  });

  it('constant angular speed (zero angular acceleration) is movement, not a pause', () => {
    const sc = scenario('approximately constant-speed cycle');
    expect(checkScenario(sc, runScenario(sc))).toEqual([]);
  });
});

describe('cycle outcomes that are not reps (ADR 0009 §2.7)', () => {
  it('finish() reports the cycle in progress as incomplete, never as a rep, and resets the detector', () => {
    const sc = scenario('incomplete cycle at session end');
    const trace = generateScenario(sc.script, BASE_OPTIONS);
    const detector = new RotationalRepDetector('s', SCENARIO_CALIBRATION);
    const events = runSamples(detector, trace.samples);
    expect(events.map((e) => e.classification)).toEqual(['full']);
    const [incomplete, ...rest] = detector.finish();
    expect(rest).toEqual([]);
    expect(incomplete).toMatchObject({ outcome: 'incomplete', reason: 'session_end' });
    expect(incomplete!.peak_excursion_rad / SCENARIO_CALIBRATION.full_rom_rad).toBeGreaterThan(0.6);
    expect(detector.finish()).toEqual([]);
  });

  it('takeUnfinishedCycles() drains interrupted cycles as they happen', () => {
    const sc = scenario('disconnect mid-cycle: that cycle is interrupted, the rest are timed correctly');
    const trace = generateScenario(sc.script, { ...BASE_OPTIONS, ...sc.options });
    const detector = new RotationalRepDetector('s', SCENARIO_CALIBRATION);
    const before = runSamples(detector, trace.samples.filter((s) => s.timestamp_ms <= 5600));
    expect(before).toHaveLength(1);
    expect(detector.takeUnfinishedCycles()).toEqual([expect.objectContaining({ outcome: 'interrupted' })]);
    expect(detector.takeUnfinishedCycles()).toEqual([]);
  });

  it('a session that ends at rest has nothing unfinished', () => {
    const run = runScenario(scenario('one continuous full cycle'));
    expect(run.unfinished).toEqual([]);
  });

  it('reset() discards unfinished cycles and the gravity reference', () => {
    const sc = scenario('incomplete cycle at session end');
    const trace = generateScenario(sc.script, BASE_OPTIONS);
    const detector = new RotationalRepDetector('s', SCENARIO_CALIBRATION);
    runSamples(detector, trace.samples);
    detector.reset();
    expect(detector.finish()).toEqual([]);
  });
});

describe('negative controls: the suite detects meaningful regressions', () => {
  /** Counts every motion onset after a still period — the "renewed acceleration is a new rep" mistake. */
  class OnsetCounter implements MotionDetector<RepEvent> {
    readonly algorithmVersion = 'negative-control-onset-counter';
    private still = 0;
    private inMotion = false;
    private template: RepEvent | null = null;
    constructor(private readonly inner = new RotationalRepDetector('s', SCENARIO_CALIBRATION)) {}
    push(sample: RawSensorSample): RepEvent[] {
      const real = this.inner.push(sample);
      this.template ??= real[0] ?? null;
      const omega = Math.abs(sample.gyro_rad_s[0]);
      if (omega < 0.1) this.still += 1;
      const onset = omega > 0.5 && !this.inMotion && this.still >= 10;
      if (omega > 0.5) {
        this.inMotion = true;
        this.still = 0;
      } else if (omega < 0.1) {
        this.inMotion = false;
      }
      if (!onset) return [];
      return [{ ...(this.template ?? fakeEvent()), timestamp_ms: sample.timestamp_ms, start_timestamp_ms: sample.timestamp_ms }];
    }
    reset(): void {
      this.inner.reset();
    }
  }

  it('an onset counter (counts resumed acceleration as a rep) fails the owner case', () => {
    expect(checkScenario(scenario(OWNER_CASE), runScenario(scenario(OWNER_CASE), () => new OnsetCounter()))).not.toEqual([]);
  });

  it('a detector whose pause ends the cycle fails the owner case', () => {
    // Mutant: a 1 s timeout that abandons the cycle and resyncs at the paused position.
    const mutant: DetectorFactory = (cal) => new LegacyRotationalRepDetector('s', cal, { maxRepDurationMs: 1000 });
    expect(checkScenario(scenario(OWNER_CASE), runScenario(scenario(OWNER_CASE), mutant))).not.toEqual([]);
  });

  it('reproduces the 0.1.0 defects this task fixes (frozen copy of the previous detector)', () => {
    const legacy: DetectorFactory = (cal) => new LegacyRotationalRepDetector('s', cal);
    const failing = SCENARIOS.filter((sc) => checkScenario(sc, runScenario(sc, legacy)).length > 0).map((s) => s.name);
    // Owner case passes on 0.1.0 too; the long-pause, disconnect, jitter and session-end cases do not.
    expect(failing).not.toContain(OWNER_CASE);
    expect(failing).toEqual(
      expect.arrayContaining([
        'small jitter while holding at start and mid-cycle',
        'long pause (15 s) midway, then continuation',
        'long hold (20 s) at the top, then return',
        'incomplete cycle at session end',
        'disconnect mid-cycle: that cycle is interrupted, the rest are timed correctly',
      ]),
    );
  });

  it('timing assertions catch an event fired half a cycle late even when the count is right', () => {
    const sc = scenario('one continuous full cycle');
    const run = runScenario(sc);
    const shifted = { ...run, events: run.events.map((e) => ({ ...e, timestamp_ms: e.timestamp_ms + 500 })) };
    expect(checkScenario(sc, shifted).some((v) => v.includes('completion at'))).toBe(true);
  });
});

function runSamples(detector: MotionDetector<RepEvent>, samples: readonly RawSensorSample[]): RepEvent[] {
  return samples.flatMap((s) => detector.push(s));
}

function fakeEvent(): RepEvent {
  return {
    session_id: 's',
    activity_type: 'gym',
    event_type: 'rep_completed',
    timestamp_ms: 0,
    value: 1,
    classification: 'full',
    confidence: null,
    calibration_id: SCENARIO_CALIBRATION.calibration_id,
    algorithm_version: 'negative-control',
    provenance: 'imu_algorithm',
    start_timestamp_ms: 0,
    peak_excursion_rad: 0,
    quality_flags: [],
  };
}
