// Tests for the serial-capture decoder, on SYNTHETIC captures built from the shared golden packets
// (packages/sensor-protocol/fixtures/v1). They show the tool reads the firmware's line format; they say nothing about
// a real sensor. Run with `npm run test:firmware`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeCapture, formatSummary, samplesToCsv } from './decode-serial-capture.mjs';

const golden = JSON.parse(readFileSync(new URL('../../packages/sensor-protocol/fixtures/v1/golden-packets.json', import.meta.url), 'utf8'));
const hex = (name) => golden.valid.find((v) => v.name === name).hex;

test('decodes a capture: identity, stream, samples and plausibility figures', () => {
  const capture = [
    '# imu stream firmware 0.1 (uno-usb), protocol v1',
    `I ${hex('device-info-ok')}`,
    '# imu ok (WHO_AM_I=0x68); stream 0x1234 at 50 Hz, +-2 g, +-250 dps',
    `S ${hex('samples-stream-start-1')}`,
    `12:00:00.123 -> S ${hex('samples-mid-stream-5')}`, // serial-monitor timestamp prefix
    '# t=1000 seq=5 accel_m_s2=0.00,0.00,9.81 gyro_dps=1.00,-1.00,0.00',
    '',
  ].join('\r\n');
  const summary = decodeCapture(capture);
  assert.equal(summary.counts.samplePackets, 2);
  assert.equal(summary.counts.infoPackets, 1);
  assert.equal(summary.counts.invalid, 0);
  assert.equal(summary.info.status, 0);
  assert.ok(summary.samples.length > 1);
  assert.equal(summary.events.stream_started, 1);
  assert.ok(summary.stats.accelMagnitudeMS2.mean > 0);
  const text = formatSummary(summary);
  assert.match(text, /Device: serial [0-9a-f]{16}/);
  assert.match(text, /Hz measured/);
  assert.match(samplesToCsv(summary.samples), /^timestamp_ms,ax_m_s2/);
});

test('reports unreadable lines, device errors and a missing stream start instead of hiding them', () => {
  const capture = [`S ${hex('samples-mid-stream-5')}`, 'S 0102zz', 'E 2 imu read failed', 'garbage'].join('\n');
  const summary = decodeCapture(capture);
  assert.equal(summary.counts.invalid, 2);
  assert.equal(summary.counts.deviceErrors, 1);
  assert.equal(summary.events.stale_packet, 1); // a mid-stream packet without its stream start is dropped
  assert.equal(summary.samples.length, 0);
  assert.equal(summary.info, null);
  assert.match(formatSummary(summary), /no device-info packet/);
});

test('an unconfigured serial (all zeros) is refused, with the fix to make', () => {
  const zero = golden.invalid.find((v) => v.name === 'device-info-zero-serial').hex;
  const summary = decodeCapture(`I ${zero}`);
  assert.equal(summary.counts.invalid, 1);
  assert.equal(summary.info, null);
  assert.match(formatSummary(summary), /set IMU_DEVICE_SERIAL in firmware\/uno-usb\/device_config\.h/);
});
