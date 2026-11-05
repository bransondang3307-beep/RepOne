import type { MotionDetector, RawSensorSample, RepCalibration, RepEvent } from '@repone/sensor-contracts';
import { evaluateReps } from './evaluateReps';
import { RotationalRepDetector, type RotationalRepDetectorConfig, type UnfinishedCycle } from './RotationalRepDetector';

/**
 * Offline replay and evaluation of labelled trials (RO-032; capture protocol in
 * docs/experiments/rep-detection-capture-protocol.md). A trial is one recording plus hand-made reference labels.
 * Samples use the raw-sample contract unchanged (`RawSensorSample`: m/s², rad/s, device milliseconds).
 */
export const TRIAL_FORMAT = 'rep-trial-v1';

export interface TrialCycleLabel {
  /** When the mechanism left the start position, sensor ms. */
  readonly start_ms: number;
  /** When it was back at rest at the start position, sensor ms. */
  readonly end_ms: number;
  /** `incomplete`: the operator did not finish the cycle (e.g. the recording ended mid-movement). Never a rep. */
  readonly classification: 'full' | 'partial' | 'incomplete';
  readonly note?: string;
}

export interface TrialStillLabel {
  readonly start_ms: number;
  readonly end_ms: number;
  /** `hold`: stationary between cycles. `pause`: stationary inside a cycle. Jitter while holding still counts. */
  readonly kind: 'hold' | 'pause';
}

export interface RecordedTrial {
  readonly format: typeof TRIAL_FORMAT;
  readonly trial_id: string;
  /** Protocol scenario, e.g. `midway-pause`. Results are reported per scenario. */
  readonly scenario: string;
  /** `synthetic`: generated, never a measurement. `sensor`: recorded from a physical IMU. Never mixed in one result. */
  readonly provenance: 'synthetic' | 'sensor';
  /** `tuning` trials may be used to choose thresholds; only `evaluation` trials are independent validation. */
  readonly split: 'tuning' | 'evaluation';
  readonly calibration: RepCalibration;
  readonly samples: readonly RawSensorSample[];
  readonly labels: {
    readonly cycles: readonly TrialCycleLabel[];
    readonly stills: readonly TrialStillLabel[];
    /** Who labelled the trial and how (e.g. `owner, video frames at 30 fps`). */
    readonly method: string;
  };
  readonly notes?: string;
}

export interface TrialEvaluationOptions {
  /** A detection matches a label when it completes within [start_ms, end_ms + this]. Default 250 ms. */
  readonly matchToleranceMs?: number;
  /** |completion − label end_ms| at most this counts as on time. Default 500 ms. */
  readonly timingToleranceMs?: number;
  readonly config?: Partial<RotationalRepDetectorConfig>;
  /** Default: `RotationalRepDetector` with `config`. */
  readonly createDetector?: (calibration: RepCalibration) => MotionDetector<RepEvent> & { finish?: () => UnfinishedCycle[] };
}

export interface TrialEvaluation {
  readonly trial_id: string;
  readonly scenario: string;
  readonly provenance: RecordedTrial['provenance'];
  readonly split: RecordedTrial['split'];
  readonly algorithm_version: string;
  readonly labelledFull: number;
  readonly labelledPartial: number;
  readonly detectedFull: number;
  readonly detectedPartial: number;
  /** Matched labels where both label and detection are `full`. */
  readonly fullTruePositives: number;
  readonly fullPrecision: number | null;
  readonly fullRecall: number | null;
  /** Labelled full/partial cycles with no matching detection. */
  readonly missedReps: number;
  /** Detections matching no label. */
  readonly extraDetections: number;
  /** Detections completing inside a labelled hold (between cycles), after the grace period. */
  readonly falseCountsDuringHolds: number;
  /** Detections completing inside a labelled pause (inside a cycle), after the grace period. */
  readonly eventsDuringPauses: number;
  readonly fullAsPartial: number;
  readonly partialAsFull: number;
  /** Signed completion − label end_ms for matched labels, ms. Negative = early (expected: see ADR 0009 §2.4). */
  readonly timingErrorsMs: readonly number[];
  readonly timingOutsideTolerance: number;
  readonly unfinishedCycles: readonly UnfinishedCycle[];
  readonly labelledIncomplete: number;
}

/** Structural and provenance checks. An empty list means the trial can be evaluated. */
export function validateTrial(trial: RecordedTrial): string[] {
  const problems: string[] = [];
  if (trial.format !== TRIAL_FORMAT) problems.push(`format must be ${TRIAL_FORMAT}`);
  if (!trial.trial_id) problems.push('trial_id is required');
  if (trial.provenance !== 'synthetic' && trial.provenance !== 'sensor') problems.push('provenance must be synthetic or sensor');
  if (trial.split !== 'tuning' && trial.split !== 'evaluation') problems.push('split must be tuning or evaluation');
  if (!(trial.calibration?.full_rom_rad > 0)) problems.push('calibration.full_rom_rad must be positive');
  if (!trial.labels?.method) problems.push('labels.method must say who labelled the trial and how');
  const samples = trial.samples ?? [];
  if (samples.length === 0) problems.push('no samples');
  let synthetic = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (i > 0 && s.timestamp_ms < samples[i - 1]!.timestamp_ms) {
      problems.push(`samples out of order at index ${i}`);
      break;
    }
    if (s.quality_flags.includes('synthetic')) synthetic += 1;
  }
  // Implausible magnitudes usually mean raw counts or degrees were not converted (MPU-6050 maxima: ±16 g, ±2000 °/s).
  const gyroMax = Math.max(0, ...samples.map((s) => Math.max(...s.gyro_rad_s.map(Math.abs))));
  const accelMax = Math.max(0, ...samples.map((s) => Math.max(...s.accel_m_s2.map(Math.abs))));
  if (gyroMax > 35) problems.push(`gyro reaches ${gyroMax.toFixed(1)} rad/s: units are probably not rad/s`);
  if (accelMax > 160) problems.push(`accelerometer reaches ${accelMax.toFixed(1)} m/s²: units are probably not m/s²`);
  if (trial.provenance === 'sensor' && synthetic > 0) problems.push('sensor trial contains samples flagged synthetic');
  if (trial.provenance === 'synthetic' && synthetic !== samples.length) problems.push('synthetic trial has samples not flagged synthetic');
  const first = samples[0]?.timestamp_ms ?? 0;
  const last = samples[samples.length - 1]?.timestamp_ms ?? 0;
  for (const [kind, list] of [['cycle', trial.labels?.cycles ?? []], ['still', trial.labels?.stills ?? []]] as const) {
    list.forEach((l, i) => {
      if (!(l.end_ms > l.start_ms)) problems.push(`${kind} label ${i}: end_ms must be after start_ms`);
      if (l.start_ms < first || l.end_ms > last + 1000) problems.push(`${kind} label ${i}: outside the recording`);
    });
  }
  return problems;
}

export function evaluateTrial(trial: RecordedTrial, options: TrialEvaluationOptions = {}): TrialEvaluation {
  const matchTol = options.matchToleranceMs ?? 250;
  const timingTol = options.timingToleranceMs ?? 500;
  const detector =
    options.createDetector?.(trial.calibration) ?? new RotationalRepDetector(trial.trial_id, trial.calibration, options.config);
  const events = trial.samples.flatMap((s) => detector.push(s));
  const unfinishedCycles = detector.finish?.() ?? [];

  const repLabels = trial.labels.cycles.filter(
    (c): c is TrialCycleLabel & { classification: 'full' | 'partial' } => c.classification !== 'incomplete',
  );
  // amplitudeRad is unknown for recorded trials and unused by matching.
  const truth = repLabels.map((c) => ({ startMs: c.start_ms, endMs: c.end_ms, classification: c.classification, amplitudeRad: 0 }));
  const match = evaluateReps(events, truth, matchTol);
  const repLabelsByMatch = (label: (typeof truth)[number]) => repLabels[truth.indexOf(label)]!;
  const pairs = match.matched.map((m) => ({ label: repLabelsByMatch(m.label), event: m.event }));
  const inside = (kind: TrialStillLabel['kind']) =>
    events.filter((e) =>
      trial.labels.stills.some((s) => s.kind === kind && e.timestamp_ms > s.start_ms + matchTol && e.timestamp_ms < s.end_ms),
    ).length;
  const timingErrorsMs = pairs.map((p) => p.event.timestamp_ms - p.label.end_ms);
  const detectedFull = events.filter((e) => e.classification === 'full').length;
  const labelledFull = repLabels.filter((c) => c.classification === 'full').length;
  const fullTruePositives = pairs.filter((p) => p.label.classification === 'full' && p.event.classification === 'full').length;
  const ratio = (num: number, den: number) => (den === 0 ? null : num / den);

  return {
    trial_id: trial.trial_id,
    scenario: trial.scenario,
    provenance: trial.provenance,
    split: trial.split,
    algorithm_version: detector.algorithmVersion,
    labelledFull,
    labelledPartial: repLabels.length - labelledFull,
    detectedFull,
    detectedPartial: events.length - detectedFull,
    fullTruePositives,
    fullPrecision: ratio(fullTruePositives, detectedFull),
    fullRecall: ratio(fullTruePositives, labelledFull),
    missedReps: match.falseNegatives,
    extraDetections: match.falsePositives,
    falseCountsDuringHolds: inside('hold'),
    eventsDuringPauses: inside('pause'),
    fullAsPartial: pairs.filter((p) => p.label.classification === 'full' && p.event.classification === 'partial').length,
    partialAsFull: pairs.filter((p) => p.label.classification === 'partial' && p.event.classification === 'full').length,
    timingErrorsMs,
    timingOutsideTolerance: timingErrorsMs.filter((e) => Math.abs(e) > timingTol).length,
    unfinishedCycles,
    labelledIncomplete: trial.labels.cycles.length - repLabels.length,
  };
}

export interface EvaluationGroup {
  readonly provenance: RecordedTrial['provenance'];
  readonly split: RecordedTrial['split'];
  readonly trials: readonly TrialEvaluation[];
  readonly totals: Omit<TrialEvaluation, 'trial_id' | 'scenario' | 'provenance' | 'split' | 'algorithm_version'>;
  /** Scenarios with any miss, extra detection, false hold count, misclassification or off-time completion. */
  readonly failingScenarios: readonly string[];
}

/** Group by provenance and split: synthetic and sensor results, and tuning and evaluation splits, never mix. */
export function summarizeEvaluations(evaluations: readonly TrialEvaluation[]): EvaluationGroup[] {
  const groups: EvaluationGroup[] = [];
  for (const provenance of ['sensor', 'synthetic'] as const) {
    for (const split of ['evaluation', 'tuning'] as const) {
      const trials = evaluations.filter((e) => e.provenance === provenance && e.split === split);
      if (trials.length === 0) continue;
      const sum = (f: (e: TrialEvaluation) => number) => trials.reduce((a, e) => a + f(e), 0);
      const detectedFull = sum((e) => e.detectedFull);
      const labelledFull = sum((e) => e.labelledFull);
      const fullTruePositives = sum((e) => e.fullTruePositives);
      const failing = trials.filter(
        (e) =>
          e.missedReps + e.extraDetections + e.falseCountsDuringHolds + e.eventsDuringPauses + e.fullAsPartial + e.partialAsFull +
            e.timingOutsideTolerance >
          0,
      );
      groups.push({
        provenance,
        split,
        trials,
        totals: {
          labelledFull,
          labelledPartial: sum((e) => e.labelledPartial),
          detectedFull,
          detectedPartial: sum((e) => e.detectedPartial),
          fullTruePositives,
          fullPrecision: detectedFull === 0 ? null : fullTruePositives / detectedFull,
          fullRecall: labelledFull === 0 ? null : fullTruePositives / labelledFull,
          missedReps: sum((e) => e.missedReps),
          extraDetections: sum((e) => e.extraDetections),
          falseCountsDuringHolds: sum((e) => e.falseCountsDuringHolds),
          eventsDuringPauses: sum((e) => e.eventsDuringPauses),
          fullAsPartial: sum((e) => e.fullAsPartial),
          partialAsFull: sum((e) => e.partialAsFull),
          timingErrorsMs: trials.flatMap((e) => e.timingErrorsMs),
          timingOutsideTolerance: sum((e) => e.timingOutsideTolerance),
          unfinishedCycles: trials.flatMap((e) => e.unfinishedCycles),
          labelledIncomplete: sum((e) => e.labelledIncomplete),
        },
        failingScenarios: [...new Set(failing.map((e) => e.scenario))],
      });
    }
  }
  return groups;
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)} %`);

/** Plain-text report. Each provenance/split group is a separate section with its own caveat. */
export function formatEvaluationReport(groups: readonly EvaluationGroup[], timingToleranceMs = 500): string {
  if (groups.length === 0) return 'No trials evaluated.';
  const lines: string[] = [];
  for (const g of groups) {
    const t = g.totals;
    const abs = t.timingErrorsMs.map(Math.abs);
    const versions = [...new Set(g.trials.map((e) => e.algorithm_version))].join(', ');
    lines.push(`== ${g.provenance.toUpperCase()} data — ${g.split} split — ${g.trials.length} trial(s) — ${versions}`);
    if (g.provenance === 'synthetic') lines.push('   SYNTHETIC: generated traces, not measurements. Says nothing about real-hardware accuracy.');
    if (g.split === 'tuning') lines.push('   TUNING split: may have informed thresholds; NOT independent validation.');
    lines.push(
      `   full reps: labelled ${t.labelledFull}, detected ${t.detectedFull}, correct ${t.fullTruePositives}; ` +
        `precision ${pct(t.fullPrecision)}, recall ${pct(t.fullRecall)}`,
      `   partials: labelled ${t.labelledPartial}, detected ${t.detectedPartial}; ` +
        `misclassified full→partial ${t.fullAsPartial}, partial→full ${t.partialAsFull}`,
      `   missed reps ${t.missedReps}; extra detections ${t.extraDetections}; ` +
        `false counts during holds ${t.falseCountsDuringHolds}; events during pauses ${t.eventsDuringPauses}`,
      `   timing (completion − labelled end): ${abs.length} matched, mean |err| ${abs.length ? (abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(0) : 'n/a'} ms, ` +
        `max |err| ${abs.length ? Math.max(...abs).toFixed(0) : 'n/a'} ms, outside ±${timingToleranceMs} ms: ${t.timingOutsideTolerance}`,
      `   unfinished cycles reported: ${t.unfinishedCycles.length} ` +
        `(${t.unfinishedCycles.map((u) => u.outcome).join(', ') || 'none'}); labelled incomplete: ${t.labelledIncomplete}`,
      `   failing scenarios: ${g.failingScenarios.join('; ') || 'none'}`,
    );
    lines.push('   per trial: id | full lab/det/ok | partial lab/det | missed | extra | hold FP | pause ev | timing errs ms');
    for (const e of g.trials) {
      lines.push(
        `     ${e.trial_id.includes(e.scenario) ? e.trial_id : `${e.trial_id} (${e.scenario})`} | ${e.labelledFull}/${e.detectedFull}/${e.fullTruePositives} | ` +
          `${e.labelledPartial}/${e.detectedPartial} | ${e.missedReps} | ${e.extraDetections} | ${e.falseCountsDuringHolds} | ` +
          `${e.eventsDuringPauses} | ${e.timingErrorsMs.map((x) => x.toFixed(0)).join(' ') || '-'}`,
      );
    }
  }
  return lines.join('\n');
}
