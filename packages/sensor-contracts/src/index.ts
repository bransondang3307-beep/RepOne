// Public API of @repone/sensor-contracts — the "Interfaces / Contracts" layer.
// Hardware-independent: no React, React Native, Expo, SQLite or Bluetooth imports.

export * from './common';

// Raw sensor contract (source of truth §7 "Raw sensor sample")
export type { RawSensorSample, SensorSource, SensorSourceKind, SensorStatus } from './sensor';
export { BaseSensorSource } from './BaseSensorSource';

// Derived-event, detector and calibration contracts (source of truth §7 "Derived event")
export type { MotionDetector, RepCalibration, RepEvent } from './derived';

// Module B — deterministic sensor simulation (implements SensorSource)
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
export { SimulatedSensorSource, type SimulatedSensorSourceDeps } from './simulation/SimulatedSensorSource';
export { ReplaySensorSource, type ReplaySensorSourceDeps } from './simulation/ReplaySensorSource';
