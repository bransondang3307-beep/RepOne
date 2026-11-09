/**
 * CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xFFFF, no reflection, no final XOR.
 * Check value: "123456789" → 0x29B1. Bitwise rather than table-driven, to match the firmware line for line.
 */
export function crc16CcittFalse(bytes: Uint8Array, end: number = bytes.length): number {
  let crc = 0xffff;
  for (let i = 0; i < end; i++) {
    crc ^= bytes[i]! << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}
