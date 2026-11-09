// Cross-boundary regression, SYNTHETIC data only. The firmware's own protocol library writes a serial capture exactly
// as the Uno R3 sketch prints it (firmware/test/host/emit_serial_capture.cpp), and the app's decoder and StreamTracker
// read it back (decode-serial-capture.mjs over @repone/sensor-protocol).
// Until now each side was tested only against the golden single packets: the firmware encoder byte for byte, the
// decoder line by line. Here the two implementations must agree on whole streams: batching, sequence numbers across
// packets, the stream-start flag, a refused packet, a stream restart, and the 32-bit millis() wrap.
// Run by `npm run test:firmware` (needs a C++17 compiler: `c++`, or set CXX).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeCapture } from './decode-serial-capture.mjs';

const FIRMWARE = fileURLToPath(new URL('..', import.meta.url));
const LIB = join(FIRMWARE, 'lib', 'ImuStreamProtocol', 'src');
let work;
let emitter;

before(() => {
  work = mkdtempSync(join(tmpdir(), 'imu-emit-'));
  emitter = join(work, process.platform === 'win32' ? 'emit.exe' : 'emit');
  const cxx = process.env.CXX || 'c++';
  const sources = [join(FIRMWARE, 'test', 'host', 'emit_serial_capture.cpp'), join(LIB, 'ImuStreamProtocol.cpp')];
  const build = spawnSync(cxx, ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', LIB, ...sources, '-o', emitter], {
    encoding: 'utf8',
  });
  assert.equal(build.error, undefined, `cannot run the C++ compiler '${cxx}'; set CXX`);
  assert.equal(build.status, 0, build.stderr);
});

after(() => rmSync(work, { recursive: true, force: true }));

/** Run the emitter: capacity, sample count, start time (ms), refused packet index, restart sample index. */
function capture(capacity, samples, startMs, refusedPacket = -1, restartAt = -1) {
  const run = spawnSync(emitter, [capacity, samples, startMs, refusedPacket, restartAt].map(String), { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return decodeCapture(run.stdout);
}

const gapFlagged = (summary) => summary.samples.filter((s) => s.quality_flags.includes('sample_gap')).length;
const strictlyIncreasing = (summary) => summary.samples.every((s, i, all) => i === 0 || s.timestamp_ms > all[i - 1].timestamp_ms);

test('Uno R3 batching (one sample per packet): every sample arrives, in order, continuous, at 50 Hz', () => {
  const summary = capture(1, 100, 5000);
  assert.equal(summary.counts.invalid, 0);
  assert.equal(summary.counts.infoPackets, 1);
  assert.equal(summary.info.deviceSerial, '0000a1b2c3d4e5f6');
  assert.equal(summary.counts.samplePackets, 100);
  assert.deepEqual(summary.events, { stream_started: 1 });
  assert.equal(summary.samples.length, 100);
  assert.equal(gapFlagged(summary), 0);
  assert.ok(strictlyIncreasing(summary));
  assert.ok(Math.abs(summary.stats.rateHz - 50) < 1e-9);
  const [first] = summary.samples;
  assert.ok(Math.abs(first.accel_m_s2[2] - 9.80665) < 1e-9); // 16384 counts at ±2 g = 1 g
  assert.ok(Math.abs(first.gyro_rad_s[0] - Math.PI / 180) < 1e-9); // 131 counts at ±250 °/s = 1 °/s
});

test('BLE-style batching (5 per packet) across the 32-bit millis() wrap: continuous, strictly increasing time', () => {
  const summary = capture(5, 47, 4294967000); // the wrap falls inside the stream
  assert.equal(summary.counts.invalid, 0);
  assert.equal(summary.counts.samplePackets, 10); // 9 full packets + a 2-sample tail
  assert.deepEqual(summary.events, { stream_started: 1 });
  assert.equal(summary.samples.length, 47);
  assert.equal(gapFlagged(summary), 0);
  assert.ok(strictlyIncreasing(summary));
  assert.ok(Math.abs(summary.stats.rateHz - 50) < 1e-9);
});

test('a refused packet mid-stream: the gap is counted, DEVICE_OVERFLOW is seen, and only the next sample is flagged', () => {
  const summary = capture(5, 30, 5000, 2); // the third packet (samples 10–14) is lost
  assert.equal(summary.counts.invalid, 0);
  assert.deepEqual(summary.events, { stream_started: 1, samples_lost: 5, device_overflow: 1 });
  assert.equal(summary.samples.length, 25);
  assert.equal(gapFlagged(summary), 1);
  const flagged = summary.samples.find((s) => s.quality_flags.includes('sample_gap'));
  assert.equal(flagged.timestamp_ms, 5000 + 20 * 15); // the first sample after the lost ones
});

test('the first packet refused: the next one starts the stream again, so nothing is dropped as stale', () => {
  const summary = capture(5, 30, 5000, 0);
  assert.equal(summary.counts.invalid, 0);
  assert.deepEqual(summary.events, { stream_started: 1, device_overflow: 1 });
  assert.equal(summary.samples.length, 25);
  assert.equal(summary.samples[0].timestamp_ms, 5000 + 20 * 5);
  assert.equal(gapFlagged(summary), 1);
});

test('an IMU failure mid-stream: E 2, a new stream, and timing measured within each stream', () => {
  const summary = capture(1, 60, 5000, -1, 30);
  assert.equal(summary.counts.invalid, 0);
  assert.deepEqual(
    summary.deviceErrors.map((e) => e.status),
    [2],
  );
  assert.deepEqual(summary.events, { stream_started: 1, stream_restarted: 1 });
  assert.deepEqual(
    summary.streams.map((s) => s.samples.length),
    [30, 30],
  );
  assert.ok(Math.abs(summary.stats.rateHz - 50) < 1e-9);
});
