// Public API of @repone/rep-engine — pure TypeScript rep detection (Module C).
// Depends only on @repone/sensor-contracts. No React, Expo, SQLite or Bluetooth.

export {
  calibrateFromReferenceRep,
  dominantAxis,
  estimateGyroBias,
  measurePeakExcursionRad,
  type CalibrateFromReferenceInput,
} from './calibration';
export {
  DEFAULT_ROTATIONAL_REP_CONFIG,
  ROTATIONAL_REP_ALGORITHM_VERSION,
  RotationalRepDetector,
  type RotationalRepDetectorConfig,
} from './RotationalRepDetector';
export { evaluateReps, type RepEvaluation } from './evaluateReps';
