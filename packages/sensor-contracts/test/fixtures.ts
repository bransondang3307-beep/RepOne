import { LABELLED_SET_SCRIPT, generateTrace, type SimulationOptions } from '../src';

export const BASE_SIMULATION: SimulationOptions = {
  sourceId: 'sim-test-01',
  sampleRateHz: 50,
  seed: 42,
  gyroNoiseRadS: 0.02,
  accelNoiseMS2: 0.05,
};

/** Clean-ish labelled set used across tests. Synthetic — not a real recording. */
export const labelledSetTrace = () => generateTrace(LABELLED_SET_SCRIPT, BASE_SIMULATION, 'labelled set, low noise');
