import type { GroundTruthRep, RepEvent } from '@repone/sensor-contracts';

export interface RepEvaluation {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  /** null when undefined (no detections / no labels) rather than a misleading 0 or 1. */
  readonly precision: number | null;
  readonly recall: number | null;
  /** Of matched reps, fraction whose full/partial class agrees with the label. */
  readonly classificationAgreement: number | null;
  readonly unmatchedDetections: readonly RepEvent[];
  readonly missedLabels: readonly GroundTruthRep[];
  readonly misclassified: ReadonlyArray<{ label: GroundTruthRep; event: RepEvent }>;
}

/**
 * One-to-one match detections against labelled reps. A detection matches a
 * label when its completion time falls within [label.startMs, label.endMs + toleranceMs].
 * Failure cases are returned explicitly, not just aggregate rates.
 */
export function evaluateReps(
  detections: readonly RepEvent[],
  labels: readonly GroundTruthRep[],
  toleranceMs = 250,
): RepEvaluation {
  const used = new Set<number>();
  const matched: Array<{ label: GroundTruthRep; event: RepEvent }> = [];
  const missedLabels: GroundTruthRep[] = [];

  for (const label of labels) {
    const index = detections.findIndex(
      (e, i) => !used.has(i) && e.timestamp_ms >= label.startMs && e.timestamp_ms <= label.endMs + toleranceMs,
    );
    if (index === -1) {
      missedLabels.push(label);
    } else {
      used.add(index);
      matched.push({ label, event: detections[index]! });
    }
  }

  const unmatchedDetections = detections.filter((_, i) => !used.has(i));
  const misclassified = matched.filter((m) => m.event.classification !== m.label.classification);
  const tp = matched.length;
  const ratio = (num: number, den: number) => (den === 0 ? null : num / den);

  return {
    truePositives: tp,
    falsePositives: unmatchedDetections.length,
    falseNegatives: missedLabels.length,
    precision: ratio(tp, detections.length),
    recall: ratio(tp, labels.length),
    classificationAgreement: ratio(tp - misclassified.length, tp),
    unmatchedDetections,
    missedLabels,
    misclassified,
  };
}
