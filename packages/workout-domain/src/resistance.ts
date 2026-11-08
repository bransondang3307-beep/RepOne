import type { MassUnit, Resistance } from './model';

/** Exact by definition (international avoirdupois pound, 1959). */
export const KG_PER_LB = 0.45359237;

/** Upper bound for an entered value, in the entered unit: catches typos (e.g. 2250 for 225), not a machine limit. */
export const MAX_ENTERED_RESISTANCE = 1000;

export class ResistanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResistanceError';
  }
}

/**
 * Build a user-entered resistance. The value must be a finite number greater than 0 and at most
 * `MAX_ENTERED_RESISTANCE` in the entered unit. "No resistance entered" is `null`, never 0.
 */
export function enterResistance(value: number, unit: MassUnit): Resistance {
  if (unit !== 'kg' && unit !== 'lb') throw new ResistanceError(`Unknown unit "${String(unit)}": use kg or lb`);
  if (!Number.isFinite(value) || value <= 0) throw new ResistanceError('Enter a resistance greater than 0');
  if (value > MAX_ENTERED_RESISTANCE) {
    throw new ResistanceError(`A resistance above ${MAX_ENTERED_RESISTANCE} ${unit} is probably a typo`);
  }
  return { kg: unit === 'kg' ? value : value * KG_PER_LB, entered_unit: unit, source: 'user_entered' };
}

/** The value in `unit` (default: the unit it was entered in), rounded to 0.01 so that 100 lb reads back as 100. */
export function resistanceIn(resistance: Resistance, unit: MassUnit = resistance.entered_unit): number {
  const value = unit === 'kg' ? resistance.kg : resistance.kg / KG_PER_LB;
  return Math.round(value * 100) / 100;
}

/** e.g. `100 lb`, `42.5 kg`. Labelled as entered wherever it is shown with measurements. */
export function formatResistance(resistance: Resistance, unit: MassUnit = resistance.entered_unit): string {
  return `${resistanceIn(resistance, unit)} ${unit}`;
}

/** True for a value persistence may hold: positive finite kg, a known unit, source `user_entered`. */
export function isValidResistance(resistance: Resistance): boolean {
  return (
    Number.isFinite(resistance.kg) &&
    resistance.kg > 0 &&
    (resistance.entered_unit === 'kg' || resistance.entered_unit === 'lb') &&
    resistance.source === 'user_entered'
  );
}
