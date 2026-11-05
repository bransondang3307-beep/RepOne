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
  DETECTOR_QUALITY_FLAGS,
  ROTATIONAL_REP_ALGORITHM_VERSION,
  RotationalRepDetector,
  type RotationalRepDetectorConfig,
  type UnfinishedCycle,
} from './RotationalRepDetector';
export { evaluateReps, type RepEvaluation } from './evaluateReps';
export {
  MultiChannelRepDetector,
  type ChannelDetectorFactory,
  type ChannelRepEvent,
  type MultiChannelRepDetectorOptions,
} from './MultiChannelRepDetector';
