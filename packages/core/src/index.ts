// Public API of @repone/core. Consumers import from here only — never from internal paths.

export * from './common/types';

export type { RawSensorSample, SensorSource, SensorSourceKind, SensorStatus } from './sensors/types';
export { SimulatedSensorSource, type SimulatedSensorSourceDeps } from './sensors/SimulatedSensorSource';
export { ReplaySensorSource, type ReplaySensorSourceDeps } from './sensors/ReplaySensorSource';

export { createRandom, type Random } from './simulation/prng';
export {
  GRAVITY_M_S2,
  MotionSynthesizer,
  generateTrace,
  type GroundTruthRep,
  type MotionScript,
  type MotionSegment,
  type SimulationOptions,
  type SyntheticTrace,
} from './simulation/motion';
export { DEMO_FULL_ROM_RAD, DEMO_LOOP_SCRIPT, LABELLED_SET_SCRIPT, createSyntheticCalibration } from './simulation/scripts';

export {
  calibrateFromReferenceRep,
  dominantAxis,
  estimateGyroBias,
  measurePeakExcursionRad,
  type CalibrateFromReferenceInput,
  type RepCalibration,
} from './processing/calibration';
export type { MotionDetector, RepEvent } from './processing/events';
export {
  DEFAULT_ROTATIONAL_REP_CONFIG,
  ROTATIONAL_REP_ALGORITHM_VERSION,
  RotationalRepDetector,
  type RotationalRepDetectorConfig,
} from './processing/RotationalRepDetector';

export { evaluateReps, type RepEvaluation } from './evaluation/evaluateReps';

export type {
  CalibrationRepository,
  RawSampleRepository,
  RepEventRepository,
  Repositories,
  SessionRepository,
  WorkoutSession,
  WorkoutSessionSummary,
} from './persistence/types';
export { createInMemoryRepositories } from './persistence/memory/createInMemoryRepositories';
export type { SqlDatabase, SqlValue } from './persistence/sqlite/SqlDatabase';
export { MIGRATIONS, migrate } from './persistence/sqlite/migrations';
export { createSqliteRepositories } from './persistence/sqlite/createSqliteRepositories';

export {
  WorkoutSessionController,
  type DetectorFactory,
  type SessionSnapshot,
  type SessionStatus,
  type StartSessionParams,
  type WorkoutSessionControllerDeps,
} from './session/WorkoutSessionController';
