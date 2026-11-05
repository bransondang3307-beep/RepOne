/**
 * SYNTHETIC regression scenarios with ground-truth expectations (RO-032, ADR 0009).
 * Nothing here is a physical measurement. Positions are fractions of the calibrated full range of motion (ROM);
 * the synthetic calibration's ROM is ~70°.
 */
import { DEMO_FULL_ROM_RAD } from '@repone/sensor-contracts';
import { cycle, hold, move, type ScriptItem, type Step, type TrajectoryOptions } from './trajectory';

export const SCENARIO_ROM_RAD = DEMO_FULL_ROM_RAD;

/** Mild, realistic-looking synthetic noise. Real MPU-6050 noise is not yet measured (RO-018). */
export const BASE_OPTIONS: TrajectoryOptions = {
  romRad: SCENARIO_ROM_RAD,
  sampleRateHz: 50,
  seed: 7,
  gyroNoiseRadS: 0.02,
  accelNoiseMS2: 0.05,
};

export interface Scenario {
  readonly name: string;
  readonly script: readonly ScriptItem[];
  readonly options?: Partial<TrajectoryOptions>;
  /** Expected events, in order. */
  readonly expected: ReadonlyArray<'full' | 'partial'>;
  /** Cycles that must end without a rep (gap → `interrupted`, session end → `incomplete`), by label index. */
  readonly unfinished?: ReadonlyArray<{ readonly cycleIndex: number; readonly outcome: 'interrupted' | 'incomplete' }>;
  /**
   * The final hold of these cycles sits inside the return band, so completion legitimately happens during it;
   * the event-timing and "no event during a pause" checks use the band instead of the exact return instant.
   */
  readonly completesInsideFinalHold?: readonly number[];
  /** Events expected to carry these quality flags (by event index). */
  readonly flags?: ReadonlyArray<{ readonly eventIndex: number; readonly flag: string }>;
}

const rest = (ms = 1500) => hold(ms);
const fullRep = (up = 1000, down = 1000) => cycle('full', move(1, up), move(0, down));

export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'one continuous full cycle',
    script: [rest(), fullRep(), rest()],
    expected: ['full'],
  },
  {
    name: 'owner case: upward, pause midway, continue upward, complete',
    script: [rest(), cycle('full', move(0.5, 600), hold(1500), move(1, 600), move(0, 1200)), rest()],
    expected: ['full'],
  },
  {
    name: 'multiple pauses in one cycle (outward and return)',
    script: [
      rest(),
      cycle(
        'full',
        move(0.3, 400),
        hold(800),
        move(0.6, 400),
        hold(1200),
        move(1, 400),
        hold(600),
        move(0.5, 600),
        hold(900),
        move(0, 600),
      ),
      rest(),
    ],
    expected: ['full'],
  },
  {
    name: 'pause near the top endpoint',
    script: [rest(), cycle('full', move(0.95, 900), hold(2000), move(1, 150), move(0, 1000)), rest()],
    expected: ['full'],
  },
  {
    name: 'pause just outside the return band on the way back',
    script: [rest(), cycle('full', move(1, 1000), move(0.15, 900), hold(1500), move(0, 300)), rest()],
    expected: ['full'],
  },
  {
    name: 'slow full cycle (8 s)',
    script: [rest(), fullRep(4000, 4000), rest()],
    expected: ['full'],
  },
  {
    name: 'approximately constant-speed cycle',
    script: [rest(), cycle('full', move(1, 1500, 'constant'), move(0, 1500, 'constant')), rest()],
    expected: ['full'],
  },
  {
    name: 'midway reversal and return (partial), then a full cycle',
    script: [rest(), cycle('partial', move(0.5, 700), move(0, 700)), rest(1000), fullRep(), rest()],
    expected: ['partial', 'full'],
  },
  {
    name: 'reversal that does not return to start stays one cycle',
    script: [rest(), cycle('full', move(0.6, 600), move(0.35, 400), move(1, 700), move(0, 1200)), rest()],
    expected: ['full'],
  },
  {
    // 0.5 % of ROM (~0.35°) at 8 Hz: an assumed hand-tremor model, not a measured one.
    name: 'small jitter while holding at start and mid-cycle',
    script: [
      hold(4000, 0.005, 8),
      cycle('full', move(0.5, 600), hold(3000, 0.005, 8), move(1, 600), move(0, 1200)),
      hold(4000, 0.005, 8),
    ],
    expected: ['full'],
  },
  {
    // Peaks at 17 % of ROM: 3 % below the start threshold. With 1 % margin the 6 s of un-zeroed integration noise
    // (σ ≈ 0.6 % ROM here) crosses it in some seeds — thresholds have no margin of their own.
    name: 'tremor near the start threshold never starts a cycle',
    script: [rest(), move(0.14, 600), hold(5000, 0.03, 5), move(0, 600), rest()],
    expected: [],
  },
  {
    name: 'tremor inside the return band completes the cycle once',
    script: [rest(), cycle('full', move(1, 1000), move(0.12, 900), hold(4000, 0.05, 5)), move(0, 300), rest()],
    expected: ['full'],
    completesInsideFinalHold: [0],
  },
  {
    name: 'long pause (15 s) midway, then continuation',
    script: [rest(), cycle('full', move(0.5, 600), hold(15_000), move(1, 600), move(0, 1200)), rest(), fullRep(), rest()],
    expected: ['full', 'full'],
    flags: [{ eventIndex: 0, flag: 'long_cycle' }],
  },
  {
    name: 'long hold (20 s) at the top, then return',
    script: [rest(), cycle('full', move(1, 1000), hold(20_000), move(0, 1000)), rest(), fullRep(), rest()],
    expected: ['full', 'full'],
    flags: [{ eventIndex: 0, flag: 'long_cycle' }],
  },
  {
    name: 'two legitimate consecutive cycles touching the start',
    script: [rest(), fullRep(), fullRep(), rest()],
    expected: ['full', 'full'],
  },
  {
    name: 'partial followed by a full cycle',
    script: [rest(), cycle('partial', move(0.55, 800), move(0, 800)), rest(800), fullRep(), rest()],
    expected: ['partial', 'full'],
  },
  {
    name: 'incomplete cycle at session end',
    script: [rest(), fullRep(), rest(1000), cycle('full', move(0.7, 800), hold(1000))],
    expected: ['full'],
    unfinished: [{ cycleIndex: 1, outcome: 'incomplete' }],
  },
  {
    name: 'short dropouts and irregular sampling are integrated through',
    script: [rest(), fullRep(), rest(800), cycle('full', move(0.5, 600), hold(1200), move(1, 600), move(0, 1000)), rest()],
    options: {
      timestampJitter: 0.4,
      dropouts: [
        [1900, 2020],
        [4300, 4420],
        [5400, 5520],
      ],
    },
    expected: ['full', 'full'],
  },
  {
    name: 'disconnect mid-cycle: that cycle is interrupted, the rest are timed correctly',
    script: [
      rest(),
      fullRep(),
      rest(1000),
      cycle('full', move(1, 1000), hold(2500), move(0, 1000)),
      rest(1000),
      fullRep(),
      rest(1000),
      fullRep(),
      rest(),
    ],
    // 600 ms without samples while the lever is held at the top of cycle 2.
    options: { dropouts: [[5000, 5600]] },
    expected: ['full', 'full', 'full'],
    unfinished: [{ cycleIndex: 1, outcome: 'interrupted' }],
  },
];

/** The same script with every in-cycle hold removed (the "equivalent movement without pauses"). */
export function withoutPauses(script: readonly ScriptItem[]): ScriptItem[] {
  return script.map((item) =>
    item.kind === 'cycle'
      ? { ...item, steps: item.steps.filter((s: Step) => s.kind !== 'hold') }
      : item,
  );
}
