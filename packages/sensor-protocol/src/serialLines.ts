import { PacketType } from './constants';
import { decodePacket, type DecodeError, type Packet } from './packets';

/**
 * The USB diagnostic representation (ADR 0008 §USB). The Uno R3 bring-up firmware prints one line per item at
 * 115200 baud:
 *   `S <hex>`   a sample packet       `I <hex>`   a device-info packet
 *   `# <text>`  a human-readable diagnostic (never data)
 *   `E <code> <text>`  a device error, with the same status codes as the device-info packet
 * Packets are the same bytes a BLE board would notify, hex-encoded, so one codec serves both transports.
 */
export type SerialLine =
  | { readonly kind: 'packet'; readonly packet: Packet }
  | { readonly kind: 'diagnostic'; readonly text: string }
  | { readonly kind: 'device_error'; readonly status: number; readonly text: string }
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid'; readonly reason: string; readonly decodeError?: DecodeError };

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Strict: an even number of hex digits and nothing else. Returns null otherwise. */
export function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

export function parseSerialLine(raw: string): SerialLine {
  const line = raw.replace(/\r?\n$/, '').replace(/\r$/, '');
  if (line.trim() === '') return { kind: 'empty' };
  if (line.startsWith('#')) return { kind: 'diagnostic', text: line.slice(1).trim() };
  const error = /^E (\d{1,3}) ?(.*)$/.exec(line);
  if (error) {
    const status = Number(error[1]);
    if (status < 1 || status > 255) return { kind: 'invalid', reason: `device error status ${status} is out of range` };
    return { kind: 'device_error', status, text: error[2] ?? '' };
  }
  const packetLine = /^([SI]) ([0-9A-Za-z]+)$/.exec(line);
  if (!packetLine) return { kind: 'invalid', reason: 'not a recognised line' };
  const bytes = hexToBytes(packetLine[2]!);
  if (!bytes) return { kind: 'invalid', reason: 'packet is not whole bytes of hexadecimal' };
  const decoded = decodePacket(bytes);
  if (!decoded.ok) return { kind: 'invalid', reason: decoded.error.message, decodeError: decoded.error };
  const expected = packetLine[1] === 'S' ? PacketType.Samples : PacketType.DeviceInfo;
  if (bytes[1] !== expected) return { kind: 'invalid', reason: `'${packetLine[1]}' line carries the wrong packet type` };
  return { kind: 'packet', packet: decoded.packet };
}
