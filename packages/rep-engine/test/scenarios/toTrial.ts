/**
 * Render the SYNTHETIC scenario catalog as `rep-trial-v1` trials, so the offline evaluation command can be
 * exercised end to end before any real recording exists. Labels come from the script (ground truth), never from a
 * detector. Split is `tuning`: these scenarios were used while developing the detector, so they are not validation.
 */
import { TRIAL_FORMAT, type RecordedTrial } from '../../src';
import { BASE_OPTIONS, SCENARIOS, type Scenario } from './catalog';
import { SCENARIO_CALIBRATION } from './check';
import { generateScenario } from './trajectory';

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function scenarioToTrial(scenario: Scenario): RecordedTrial {
  const options = { ...BASE_OPTIONS, ...scenario.options };
  const trace = generateScenario(scenario.script, options);
  const incomplete = new Set((scenario.unfinished ?? []).filter((u) => u.outcome === 'incomplete').map((u) => u.cycleIndex));
  return {
    format: TRIAL_FORMAT,
    trial_id: `synthetic-${slug(scenario.name)}`,
    scenario: slug(scenario.name),
    provenance: 'synthetic',
    split: 'tuning',
    calibration: { ...SCENARIO_CALIBRATION, axis: options.axis ?? 0 },
    samples: trace.samples,
    labels: {
      cycles: trace.cycles.map((c, i) => ({
        start_ms: c.startMs,
        // A cycle that ends by holding inside the start band is back at start when that hold begins.
        end_ms: scenario.completesInsideFinalHold?.includes(i)
          ? (trace.stills.find((s) => s.kind === 'pause' && s.endMs === c.endMs)?.startMs ?? c.endMs)
          : c.endMs,
        classification: incomplete.has(i) ? ('incomplete' as const) : c.classification,
      })),
      stills: trace.stills.map((s) => ({ start_ms: s.startMs, end_ms: s.endMs, kind: s.kind })),
      method: 'generated from the scripted trajectory (synthetic ground truth)',
    },
    notes: `SYNTHETIC scenario "${scenario.name}" (seed ${options.seed}, ${options.sampleRateHz} Hz). Not a measurement.`,
  };
}

export const syntheticTrials = (): RecordedTrial[] => SCENARIOS.map(scenarioToTrial);
