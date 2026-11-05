import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import {
  evaluateTrial,
  formatEvaluationReport,
  summarizeEvaluations,
  validateTrial,
  type RecordedTrial,
  type TrialEvaluation,
} from '../src';
import { SCENARIOS } from './scenarios/catalog';
import { scenarioToTrial, syntheticTrials } from './scenarios/toTrial';

const scenarioTrial = (name: string): RecordedTrial => scenarioToTrial(SCENARIOS.find((s) => s.name === name)!);

describe('trial evaluation (offline replay)', () => {
  it('scores the synthetic owner case: one correct full rep, nothing during the pause, completion before the labelled end', () => {
    const result = evaluateTrial(scenarioTrial('owner case: upward, pause midway, continue upward, complete'));
    expect(result).toMatchObject({
      provenance: 'synthetic',
      labelledFull: 1,
      detectedFull: 1,
      fullTruePositives: 1,
      fullPrecision: 1,
      fullRecall: 1,
      missedReps: 0,
      extraDetections: 0,
      falseCountsDuringHolds: 0,
      eventsDuringPauses: 0,
      timingOutsideTolerance: 0,
    });
    // Completion fires on entering the return band, before the mechanism is fully at rest (ADR 0009 §2.4).
    expect(result.timingErrorsMs[0]).toBeLessThan(0);
    expect(result.timingErrorsMs[0]).toBeGreaterThan(-500);
  });

  it('counts a disconnected cycle as a missed rep and reports it as interrupted', () => {
    const result = evaluateTrial(scenarioTrial('disconnect mid-cycle: that cycle is interrupted, the rest are timed correctly'));
    expect(result.missedReps).toBe(1);
    expect(result.extraDetections).toBe(0);
    expect(result.unfinishedCycles.map((u) => u.outcome)).toEqual(['interrupted']);
  });

  it('excludes cycles labelled incomplete from rep metrics and reports the detector outcome', () => {
    const result = evaluateTrial(scenarioTrial('incomplete cycle at session end'));
    expect(result).toMatchObject({ labelledFull: 1, labelledIncomplete: 1, missedReps: 0, extraDetections: 0 });
    expect(result.unfinishedCycles.map((u) => u.outcome)).toEqual(['incomplete']);
  });

  it('detects false counts during holds and classification errors (negative control on the metrics)', () => {
    const trial = scenarioTrial('partial followed by a full cycle');
    // Relabel: claim the partial was full, and declare the whole recording a hold. Both must be reported.
    const relabelled: RecordedTrial = {
      ...trial,
      labels: {
        ...trial.labels,
        cycles: trial.labels.cycles.map((c, i) => (i === 0 ? { ...c, classification: 'full' as const } : c)),
        stills: [{ start_ms: 0, end_ms: trial.samples[trial.samples.length - 1]!.timestamp_ms, kind: 'hold' }],
      },
    };
    const result = evaluateTrial(relabelled);
    expect(result.fullAsPartial).toBe(1);
    expect(result.falseCountsDuringHolds).toBe(2);
    expect(result.fullRecall).toBe(0.5);
  });

  it('flags off-time completions with the timing tolerance', () => {
    const trial = scenarioTrial('one continuous full cycle');
    const shifted: RecordedTrial = {
      ...trial,
      labels: { ...trial.labels, cycles: trial.labels.cycles.map((c) => ({ ...c, end_ms: c.end_ms + 900 })) },
    };
    expect(evaluateTrial(shifted).timingOutsideTolerance).toBe(1);
    expect(evaluateTrial(shifted, { timingToleranceMs: 2000 }).timingOutsideTolerance).toBe(0);
  });
});

describe('validateTrial', () => {
  const valid = scenarioTrial('one continuous full cycle');

  it('accepts a generated synthetic trial', () => {
    expect(validateTrial(valid)).toEqual([]);
  });

  it('rejects a "sensor" trial containing synthetic samples (provenance must be honest)', () => {
    expect(validateTrial({ ...valid, provenance: 'sensor' })).toContain('sensor trial contains samples flagged synthetic');
  });

  it('rejects unconverted units, out-of-order samples, bad labels and a missing labelling method', () => {
    const degrees = valid.samples.map((s) => ({ ...s, gyro_rad_s: s.gyro_rad_s.map((g) => (g * 180) / Math.PI * 30) as unknown as typeof s.gyro_rad_s }));
    expect(validateTrial({ ...valid, samples: degrees }).some((p) => p.includes('not rad/s'))).toBe(true);
    const shuffled = [valid.samples[1]!, valid.samples[0]!, ...valid.samples.slice(2)];
    expect(validateTrial({ ...valid, samples: shuffled }).some((p) => p.includes('out of order'))).toBe(true);
    const badLabel = { ...valid.labels, cycles: [{ start_ms: 2000, end_ms: 1000, classification: 'full' as const }], method: '' };
    const problems = validateTrial({ ...valid, labels: badLabel });
    expect(problems).toEqual(expect.arrayContaining(['cycle label 0: end_ms must be after start_ms', 'labels.method must say who labelled the trial and how']));
  });
});

describe('summaries never mix provenance or splits', () => {
  const evaluations = syntheticTrials().map((t) => evaluateTrial(t));

  it('reports the whole synthetic suite as one synthetic/tuning group with its caveats', () => {
    const groups = summarizeEvaluations(evaluations);
    expect(groups.map((g) => [g.provenance, g.split])).toEqual([['synthetic', 'tuning']]);
    const [group] = groups;
    expect(group!.totals.fullPrecision).toBe(1);
    expect(group!.totals.falseCountsDuringHolds).toBe(0);
    expect(group!.totals.eventsDuringPauses).toBe(0);
    const report = formatEvaluationReport(groups);
    expect(report).toContain('SYNTHETIC: generated traces, not measurements');
    expect(report).toContain('NOT independent validation');
  });

  it('keeps sensor and synthetic, tuning and evaluation results in separate sections', () => {
    const relabel = (e: TrialEvaluation, provenance: 'sensor' | 'synthetic', split: 'tuning' | 'evaluation') => ({ ...e, provenance, split });
    const [a, b, c] = evaluations;
    const groups = summarizeEvaluations([relabel(a!, 'sensor', 'evaluation'), relabel(b!, 'sensor', 'tuning'), c!]);
    expect(groups.map((g) => `${g.provenance}/${g.split}/${g.trials.length}`)).toEqual([
      'sensor/evaluation/1',
      'sensor/tuning/1',
      'synthetic/tuning/1',
    ]);
  });
});

describe('evaluate-trials command', () => {
  const script = path.join(__dirname, '..', 'scripts', 'evaluate-trials.cjs');

  it('replays the synthetic suite and prints machine-readable groups', () => {
    const out = execFileSync(process.execPath, [script, '--synthetic', '--json'], { encoding: 'utf8' });
    const groups = JSON.parse(out) as Array<{ provenance: string; split: string; trials: unknown[] }>;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ provenance: 'synthetic', split: 'tuning' });
    expect(groups[0]!.trials).toHaveLength(SCENARIOS.length);
  });
});
