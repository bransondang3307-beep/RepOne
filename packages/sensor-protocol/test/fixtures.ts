import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The shared golden packets (SYNTHETIC test values — not real measurements). The firmware host tests use the same file. */
export interface GoldenFile {
  readonly valid: { name: string; type: 'samples' | 'device_info'; fields: Record<string, unknown>; hex: string }[];
  readonly invalid: { name: string; hex: string; error: string }[];
  readonly conversions: { accelRange?: number; gyroRange?: number; raw: number; accel_m_s2?: number; gyro_rad_s?: number }[];
}

export const golden: GoldenFile = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'v1', 'golden-packets.json'), 'utf8'));

export const hex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));

export function goldenValid(name: string) {
  const entry = golden.valid.find((v) => v.name === name);
  if (!entry) throw new Error(`no golden packet named ${name}`);
  return entry;
}
