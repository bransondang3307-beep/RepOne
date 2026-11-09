import type { Vec3 } from '@repone/sensor-contracts';

/**
 * Unit conversion at the transport boundary (ADR 0008). The wire carries the MPU-6050's raw signed 16-bit counts plus
 * the full-scale range codes they were read with; only here do they become the app's contract units (m/s², rad/s).
 * Sensitivities: MPU-6000/6050 register map (RM-MPU-6000A-00), registers 27–28 (FS_SEL / AFS_SEL), nominal values.
 */

/** Standard gravity (CGPM 1901), the g in "LSB per g". */
export const STANDARD_GRAVITY_M_S2 = 9.80665;

/** A 2-bit full-scale range code, as written to the IMU's configuration registers. */
export type FullScaleCode = 0 | 1 | 2 | 3;

/** AFS_SEL 0–3: ±2, ±4, ±8, ±16 g. */
export const ACCEL_RANGE_G = [2, 4, 8, 16] as const;
export const ACCEL_LSB_PER_G = [16384, 8192, 4096, 2048] as const;
/** FS_SEL 0–3: ±250, ±500, ±1000, ±2000 °/s. */
export const GYRO_RANGE_DPS = [250, 500, 1000, 2000] as const;
export const GYRO_LSB_PER_DPS = [131, 65.5, 32.8, 16.4] as const;

export const INT16_MIN = -32768;
export const INT16_MAX = 32767;

export function isFullScaleCode(value: number): value is FullScaleCode {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function checkRaw(raw: number): void {
  if (!Number.isInteger(raw) || raw < INT16_MIN || raw > INT16_MAX) {
    throw new RangeError(`raw IMU value must be a signed 16-bit integer, got ${raw}`);
  }
}

function checkCode(code: number): asserts code is FullScaleCode {
  if (!isFullScaleCode(code)) throw new RangeError(`full-scale code must be 0–3, got ${code}`);
}

/** Raw accelerometer counts → m/s². */
export function accelRawToMS2(raw: number, code: FullScaleCode): number {
  checkRaw(raw);
  checkCode(code);
  return (raw / ACCEL_LSB_PER_G[code]) * STANDARD_GRAVITY_M_S2;
}

/** Raw gyroscope counts → rad/s. Bias is not removed here: that is calibration's job (ADR 0002). */
export function gyroRawToRadS(raw: number, code: FullScaleCode): number {
  checkRaw(raw);
  checkCode(code);
  return ((raw / GYRO_LSB_PER_DPS[code]) * Math.PI) / 180;
}

export function accelVecToMS2(raw: readonly [number, number, number], code: FullScaleCode): Vec3 {
  return [accelRawToMS2(raw[0], code), accelRawToMS2(raw[1], code), accelRawToMS2(raw[2], code)];
}

export function gyroVecToRadS(raw: readonly [number, number, number], code: FullScaleCode): Vec3 {
  return [gyroRawToRadS(raw[0], code), gyroRawToRadS(raw[1], code), gyroRawToRadS(raw[2], code)];
}

/** True when a raw count sits at the converter's limit, so the true value may have been larger. */
export function isSaturated(raw: number): boolean {
  return raw === INT16_MIN || raw === INT16_MAX;
}
