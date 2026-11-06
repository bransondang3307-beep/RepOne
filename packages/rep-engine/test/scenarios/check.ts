/**
 * Scenario checker: runs a detector over a SYNTHETIC scenario and lists every violated expectation. Returning
 * violations (instead of asserting directly) lets the negative-control tests prove that broken detectors are caught.
 */
import { createSyntheticCalibration, type MotionDetector, type RepCalibration, type RepEvent } from '@repone/sensor-contracts';
import { DEFAULT_ROTATIONAL_REP_CONFIG, RotationalRepDetector, evaluateReps, type UnfinishedCycle } from '../../src';
import { BASE_OPTIONS, type Scenario } from './catalog';
import { generateScenario, type SyntheticScenarioTrace, type TrajectoryOptions } from './trajectory';

export const SCENARIO_CALIBRATION: RepCalibration = createSyntheticCalibration(0);

export type DetectorFactory = (calibration: RepCalibration) => MotionDetector<RepEvent> & {
  finish?: () => UnfinishedCycle[];
};

export const currentDetector: DetectorFactory = (calibration) => new RotationalRepDetector('scenario', calibration);

export interface ScenarioRun {
  readonly trace: SyntheticScenarioTrace;
  readonly events: readonly RepEvent[];
  readonly unfinished: readonly UnfinishedCycle[];
  readonly options: TrajectoryOptions;
}

export function runScenario(
  scenario: Scenario,
  factory: DetectorFactory = currentDetector,
  overrides: Partial<TrajectoryOptions> = {},
  calibration: RepCalibration = SCENARIO_CALIBRATION,
): ScenarioRun {
  const options = { ...BASE_OPTIONS, ...scenario.options, ...overrides };
  const trace = generateScenario(scenario.script, options);
  const detector = factory({ ...calibration, axis: options.axis ?? 0 });
  const events = trace.samples.flatMap((s) => detector.push(s));
  const unfinished = detector.finish?.() ?? [];
  return { trace, events, unfinished, options };
}

/** Thresholds the ground-truth timing is expressed in (ADR 0009 §2: completion = back within the return band). */
const { returnFraction, startFraction } = DEFAULT_ROTATIONAL_REP_CONFIG;

export function timingToleranceMs(sampleRateHz: number): number {
  return Math.max(3 * (1000 / sampleRateHz), 60);
}

export function checkScenario(scenario: Scenario, run: ScenarioRun): string[] {
  const { trace, events, unfinished } = run;
  const violations: string[] = [];
  const got = events.map((e) => e.classification);
  if (JSON.stringify(got) !== JSON.stringify(scenario.expected)) {
    violations.push(`classifications ${JSON.stringify(got)} ≠ expected ${JSON.stringify(scenario.expected)}`);
  }

  const unfinishedIdx = new Set((scenario.unfinished ?? []).map((u) => u.cycleIndex));
  const countedCycles = trace.cycles.filter((_, i) => !unfinishedIdx.has(i));
  const evaluation = evaluateReps(
    events,
    countedCycles.map((c) => ({ ...c, amplitudeRad: c.peakFraction * run.options.romRad })),
  );
  if (evaluation.falsePositives + evaluation.falseNegatives + evaluation.misclassified.length > 0) {
    violations.push(
      `evaluateReps: FP ${evaluation.falsePositives}, FN ${evaluation.falseNegatives}, misclassified ${evaluation.misclassified.length}`,
    );
  }

  // Event timing against the true trajectory, cycle by cycle in order.
  const tol = timingToleranceMs(run.options.sampleRateHz ?? 50);
  countedCycles.forEach((cycle, i) => {
    const event = events[i];
    if (!event) return;
    const index = trace.cycles.indexOf(cycle);
    if (scenario.completesInsideFinalHold?.includes(index)) {
      const finalHold = trace.stills.filter((s) => s.kind === 'pause' && s.endMs === cycle.endMs)[0];
      if (!finalHold || event.timestamp_ms < finalHold.startMs || event.timestamp_ms > finalHold.endMs) {
        violations.push(`cycle ${index}: completion ${event.timestamp_ms} not inside its final in-band hold`);
      }
    } else {
      const expectedEnd = cycle.trueReturnMs(returnFraction);
      if (!(Math.abs(event.timestamp_ms - expectedEnd) <= tol)) {
        violations.push(`cycle ${index}: completion at ${event.timestamp_ms}, true return ${expectedEnd} (±${tol} ms)`);
      }
    }
    const expectedStart = cycle.trueOutwardMs(startFraction);
    if (!(Math.abs(event.start_timestamp_ms - expectedStart) <= tol)) {
      violations.push(`cycle ${index}: start at ${event.start_timestamp_ms}, true outward crossing ${expectedStart} (±${tol} ms)`);
    }
  });

  // No rep may complete while the mechanism is paused or held (except a hold inside the return band).
  for (const still of trace.stills) {
    const allowed = (scenario.completesInsideFinalHold ?? []).some((i) => trace.cycles[i]?.endMs === still.endMs);
    if (allowed) continue;
    for (const e of events) {
      if (e.timestamp_ms > still.startMs + tol && e.timestamp_ms < still.endMs) {
        violations.push(`event at ${e.timestamp_ms} during ${still.kind} ${still.startMs}–${still.endMs}`);
      }
    }
  }

  // Unfinished cycles: exactly the expected ones, each attributed to the right cycle.
  const expectedUnfinished = scenario.unfinished ?? [];
  if (unfinished.length !== expectedUnfinished.length) {
    violations.push(`unfinished cycles ${JSON.stringify(unfinished.map((u) => u.outcome))} ≠ expected ${JSON.stringify(expectedUnfinished.map((u) => u.outcome))}`);
  } else {
    expectedUnfinished.forEach((u, k) => {
      const cycle = trace.cycles[u.cycleIndex]!;
      const actual = unfinished[k]!;
      if (actual.outcome !== u.outcome) violations.push(`unfinished ${k}: outcome ${actual.outcome} ≠ ${u.outcome}`);
      if (actual.start_timestamp_ms < cycle.startMs || actual.start_timestamp_ms > cycle.endMs) {
        violations.push(`unfinished ${k}: start ${actual.start_timestamp_ms} outside cycle ${cycle.startMs}–${cycle.endMs}`);
      }
    });
  }

  for (const { eventIndex, flag } of scenario.flags ?? []) {
    if (!events[eventIndex]?.quality_flags.includes(flag)) violations.push(`event ${eventIndex} lacks flag ${flag}`);
  }
  return violations;
}
