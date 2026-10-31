import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppContainer, SessionSnapshot } from '../../application';

/** One detected rep of the current set, as the live rep strip draws it. Algorithm-derived, not measured. */
export interface TimelineRep {
  readonly classification: 'full' | 'partial';
  /** Peak angular excursion, radians (algorithm-derived). */
  readonly peakExcursionRad: number;
  readonly timestampMs: number;
}

export interface LiveSessionState {
  readonly session: SessionSnapshot;
  /** The current set's reps in detection order; cleared when a new set starts. */
  readonly repTimeline: readonly TimelineRep[];
  /** Phone time (epoch ms) when the current set started recording; null before. For the elapsed-time display. */
  readonly recordingStartedAtMs: number | null;
  startSimulatedSet(machineLabel?: string): Promise<void>;
  stop(): Promise<void>;
  dismissResult(): void;
}

export type LiveSessionStore = StoreApi<LiveSessionState>;

/**
 * Thin UI-state adapter over the session controller (application service).
 * Business rules live in the service and packages; this store only mirrors
 * snapshots and exposes actions.
 */
export function createLiveSessionStore(
  container: Pick<AppContainer, 'controller' | 'getSessionSensor' | 'getCalibration'>,
  now: () => number = Date.now,
): LiveSessionStore {
  const { controller } = container;

  const store = createStore<LiveSessionState>()(() => ({
    session: controller.getSnapshot(),
    repTimeline: [],
    recordingStartedAtMs: null,

    async startSimulatedSet(machineLabel) {
      // Connects the (simulated) device first if it is not connected yet.
      const sensor = await container.getSessionSensor();
      await controller.start({
        sensor,
        calibration: container.getCalibration(),
        machineLabel: machineLabel?.trim() || null,
      });
    },

    async stop() {
      await controller.stop();
    },

    dismissResult() {
      controller.reset();
    },
  }));

  controller.subscribe((session) => {
    const previous = store.getState();
    const newSet = session.sessionId !== previous.session.sessionId;
    let repTimeline = newSet ? [] : previous.repTimeline;
    const event = session.lastEvent;
    const last = repTimeline[repTimeline.length - 1];
    if (event && event.session_id === session.sessionId && event.timestamp_ms !== last?.timestampMs) {
      repTimeline = [
        ...repTimeline,
        { classification: event.classification, peakExcursionRad: event.peak_excursion_rad, timestampMs: event.timestamp_ms },
      ];
    }
    const recordingStartedAtMs =
      session.status === 'recording' && previous.session.status !== 'recording'
        ? now()
        : session.status === 'idle'
          ? null
          : previous.recordingStartedAtMs;
    store.setState({ session, repTimeline, recordingStartedAtMs });
  });
  return store;
}
