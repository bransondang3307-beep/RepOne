/** A 3-axis vector. Units are always given by the field name that holds it. */
export type Vec3 = readonly [number, number, number];

/** Index of a sensor axis: 0 = x, 1 = y, 2 = z (sensor frame). */
export type AxisIndex = 0 | 1 | 2;

export type Unsubscribe = () => void;

/** Monotonic-enough wall clock, injected so logic is testable. Epoch milliseconds. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export type IdGenerator = () => string;

/** Timer abstraction so streaming sources can be driven deterministically in tests. */
export interface Scheduler {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemScheduler: Scheduler = {
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * Where a piece of data came from. Every persisted session and metric carries one,
 * so simulated/synthetic numbers can never be mistaken for real measurements.
 */
export type DataProvenance = 'simulated' | 'replay' | 'sensor';
