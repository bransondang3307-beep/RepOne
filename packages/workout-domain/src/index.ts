// Public API of @repone/workout-domain — workout models and repository ports (Module D).
// Independent of any database implementation; depends only on @repone/sensor-contracts.

export type {
  CalibrationRepository,
  RawSampleRepository,
  RepEventRepository,
  Repositories,
  SessionRepository,
  WorkoutSession,
  WorkoutSessionSummary,
} from './repositories';
export { createInMemoryRepositories } from './memory/createInMemoryRepositories';

// Milestone 3 (RO-013, ADR 0010 — Proposed): workout model, user-entered resistance and the workout lifecycle.
export type {
  Exercise,
  ExerciseMachineLink,
  Machine,
  MassUnit,
  MotionType,
  Resistance,
  SetStatus,
  Workout,
  WorkoutExercise,
  WorkoutPause,
  WorkoutRecord,
  WorkoutSet,
  WorkoutStatus,
} from './model';
export {
  KG_PER_LB,
  MAX_ENTERED_RESISTANCE,
  ResistanceError,
  enterResistance,
  formatResistance,
  isValidResistance,
  resistanceIn,
} from './resistance';
export {
  WorkoutRuleError,
  WorkoutTransitionError,
  activeDurationMs,
  addExercise,
  addSet,
  beginSetRecording,
  endSetRecording,
  finishWorkout,
  newExercise,
  newMachine,
  newWorkout,
  pauseWorkout,
  resumeWorkout,
  setResistance,
  startWorkout,
  summarizeSetReps,
  validateWorkoutRecord,
  type WorkoutAction,
  type WorkoutRuleCode,
} from './workoutLifecycle';
