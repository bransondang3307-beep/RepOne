import { parseSerialLine } from '../src';
import { golden, goldenValid } from './fixtures';

describe('USB diagnostic lines (Uno R3 bring-up firmware)', () => {
  it('decodes sample and device-info packets from hex lines, with or without CR', () => {
    const s = parseSerialLine(`S ${goldenValid('samples-stream-start-1').hex}\r\n`);
    expect(s.kind).toBe('packet');
    if (s.kind === 'packet') expect(s.packet.type).toBe('samples');
    const i = parseSerialLine(`I ${goldenValid('device-info-ok').hex.toUpperCase()}`);
    expect(i.kind).toBe('packet');
    if (i.kind === 'packet') expect(i.packet.type).toBe('device_info');
  });

  it('keeps diagnostics and device errors separate from data', () => {
    expect(parseSerialLine('# imu WHO_AM_I=0x68 ok')).toEqual({ kind: 'diagnostic', text: 'imu WHO_AM_I=0x68 ok' });
    expect(parseSerialLine('E 1 imu not found at 0x68')).toEqual({ kind: 'device_error', status: 1, text: 'imu not found at 0x68' });
    expect(parseSerialLine('')).toEqual({ kind: 'empty' });
  });

  it.each([
    ['a line with no prefix', '0101010034120000'],
    ['an odd number of hex digits', 'S 010'],
    ['non-hex characters', 'S 01zz'],
    ['a sample line carrying device info', `S ${goldenValid('device-info-ok').hex}`],
    ['a device-info line carrying samples', `I ${goldenValid('samples-stream-start-1').hex}`],
    ['an error with status 0', 'E 0 nothing'],
  ])('rejects %s', (_label, line) => {
    expect(parseSerialLine(line).kind).toBe('invalid');
  });

  it('reports the codec error for a corrupt packet line', () => {
    const corrupt = golden.invalid.find((v) => v.name === 'bad-checksum')!;
    const parsed = parseSerialLine(`S ${corrupt.hex}`);
    expect(parsed.kind).toBe('invalid');
    if (parsed.kind === 'invalid') expect(parsed.decodeError?.code).toBe('bad_checksum');
  });
});
