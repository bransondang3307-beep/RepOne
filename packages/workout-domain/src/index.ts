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
