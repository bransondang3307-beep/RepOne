import type { DataProvenance } from '../common/types';
import type { RepCalibration } from '../processing/calibration';
import type { RepEvent } from '../processing/events';
import type { RawSensorSample, SensorSourceKind } from '../sensors/types';

export interface WorkoutSession {
  readonly id: string;
  readonly activity_type: 'gym';
  /** `simulated` / `replay` sessions must never be presented as real measurements. */
  readonly provenance: DataProvenance;
  readonly source_id: string;
  readonly source_kind: SensorSourceKind;
  readonly calibration_id: string;
  readonly algorithm_version: string;
  /** Free-text machine/exercise label entered by the user (machine profiles come later). */
  readonly machine_label: string | null;
  readonly started_at_epoch_ms: number;
  readonly ended_at_epoch_ms: number | null;
}

export interface WorkoutSessionSummary extends WorkoutSession {
  readonly full_rep_count: number;
  readonly partial_rep_count: number;
}

export interface SessionRepository {
  create(session: WorkoutSession): Promise<void>;
  markEnded(sessionId: string, endedAtEpochMs: number): Promise<void>;
  getById(sessionId: string): Promise<WorkoutSession | null>;
  /** Most recent first. */
  listRecent(limit: number): Promise<WorkoutSessionSummary[]>;
}

export interface RawSampleRepository {
  appendBatch(sessionId: string, samples: readonly RawSensorSample[]): Promise<void>;
  listBySession(sessionId: string): Promise<RawSensorSample[]>;
}

export interface RepEventRepository {
  append(event: RepEvent): Promise<void>;
  listBySession(sessionId: string): Promise<RepEvent[]>;
}

export interface CalibrationRepository {
  save(calibration: RepCalibration): Promise<void>;
  getById(calibrationId: string): Promise<RepCalibration | null>;
}

/** Everything the session layer needs from storage, injected as one bundle. */
export interface Repositories {
  readonly sessions: SessionRepository;
  readonly rawSamples: RawSampleRepository;
  readonly repEvents: RepEventRepository;
  readonly calibrations: CalibrationRepository;
}
