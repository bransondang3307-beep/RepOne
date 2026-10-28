import type { RepCalibration } from '../derived';
import type { MotionScript, MotionSegment } from './motion';

/** Nominal full range of motion used by the demo scripts, radians (~70°). */
export const DEMO_FULL_ROM_RAD = (70 * Math.PI) / 180;

const rest = (durationMs: number): MotionSegment => ({ kind: 'rest', durationMs });
const full = (durationMs = 2000, amplitudeRad = DEMO_FULL_ROM_RAD): MotionSegment => ({
  kind: 'rep',
  durationMs,
  amplitudeRad,
  label: 'full',
});
const partial = (fractionOfRom: number, durationMs = 1600): MotionSegment => ({
  kind: 'rep',
  durationMs,
  amplitudeRad: DEMO_FULL_ROM_RAD * fractionOfRom,
  label: 'partial',
});

/** Endless demo loop for the app's simulated sensor: mostly full reps, an occasional partial. */
export const DEMO_LOOP_SCRIPT: MotionScript = {
  loop: true,
  segments: [rest(1500), full(), rest(800), full(2200), rest(800), partial(0.5), rest(800), full(1800), rest(2000)],
};

/** Labelled set: 8 full reps with varying tempo, 2 partials, pauses. */
export const LABELLED_SET_SCRIPT: MotionScript = {
  segments: [
    rest(1000),
    full(2000),
    rest(600),
    full(1800),
    rest(600),
    full(2400, DEMO_FULL_ROM_RAD * 0.95),
    rest(600),
    partial(0.45),
    rest(800),
    full(1600),
    rest(600),
    full(2000, DEMO_FULL_ROM_RAD * 1.02),
    rest(1500),
    full(2200),
    rest(600),
    partial(0.6),
    rest(600),
    full(1500),
    rest(600),
    full(2600, DEMO_FULL_ROM_RAD * 0.9),
    rest(1000),
  ],
};

/**
 * A calibration that matches the demo scripts exactly. `synthetic` provenance:
 * it comes from simulation, not from a reference rep on real hardware.
 */
export function createSyntheticCalibration(createdAtEpochMs: number): RepCalibration {
  return {
    calibration_id: 'synthetic-demo-calibration-v1',
    axis: 0,
    gyro_bias_rad_s: [0, 0, 0],
    full_rom_rad: DEMO_FULL_ROM_RAD,
    provenance: 'synthetic',
    created_at_epoch_ms: createdAtEpochMs,
  };
}
