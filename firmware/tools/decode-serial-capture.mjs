// Decode a saved serial capture from the Uno R3 USB bring-up firmware (firmware/uno-usb) with the app's own codec
// (@repone/sensor-protocol), and summarise it: lines, the device's identity, stream continuity, sample rate and the
// readings' plausibility. Run from the repository root:
//
//   npm run decode:serial -- capture.txt                 # summary
//   npm run decode:serial -- capture.txt --csv out.csv   # also every sample in SI units, for plotting
//
// The capture is the serial monitor's text at 115200 baud (S/I/E/# lines, ADR 0008 §USB). Timestamps that a serial
// monitor prefixes ("12:00:00.123 -> ") are ignored. The summary reports what the data shows; it is not a
// calibration, and it cannot say whether rep counts would be right.
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

// The codec is TypeScript with extension-less relative imports (written for Jest and Metro). Node runs it from source
// with --experimental-transform-types once those imports resolve to their .ts files.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const codec = await import(new URL('../../packages/sensor-protocol/src/index.ts', import.meta.url).href);
const { StreamTracker, parseSerialLine } = codec;

/** Decode the capture's text. Returns a plain summary object (also used by the tests). */
export function decodeCapture(text) {
  const tracker = new StreamTracker({ sourceIdFor: (channel) => `capture-ch${channel}` });
  const counts = { lines: 0, samplePackets: 0, infoPackets: 0, deviceErrors: 0, diagnostics: 0, empty: 0, invalid: 0 };
  const invalid = [];
  const deviceErrors = [];
  const diagnostics = [];
  const infos = [];
  const events = {};
  const samples = [];
  /** One entry per stream (per channel): a device reboot starts a new stream with a fresh clock (Codex review). */
  const streams = [];
  const currentStream = new Map();
  const rangesSeen = new Set();

  text.split(/\r?\n/).forEach((raw, index) => {
    counts.lines += 1;
    // Strip a serial-monitor timestamp prefix such as "12:00:00.123 -> ".
    const line = raw.replace(/^\s*\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\s*->\s?/, '');
    const parsed = parseSerialLine(line);
    switch (parsed.kind) {
      case 'empty':
        counts.empty += 1;
        return;
      case 'diagnostic':
        counts.diagnostics += 1;
        if (diagnostics.length < 12 && !parsed.text.startsWith('t=')) diagnostics.push(parsed.text);
        return;
      case 'device_error':
        counts.deviceErrors += 1;
        deviceErrors.push({ line: index + 1, status: parsed.status, text: parsed.text });
        return;
      case 'invalid':
        counts.invalid += 1;
        if (invalid.length < 10) invalid.push({ line: index + 1, reason: parsed.reason, text: line.slice(0, 60) });
        return;
      case 'packet':
        break;
    }
    const packet = parsed.packet;
    if (packet.type === 'device_info') {
      counts.infoPackets += 1;
      infos.push(packet);
      return;
    }
    counts.samplePackets += 1;
    rangesSeen.add(`${packet.accelRange}/${packet.gyroRange}`);
    const result = tracker.accept(packet);
    for (const event of result.events) {
      events[event.kind] = (events[event.kind] ?? 0) + (event.kind === 'samples_lost' ? event.count : 1);
      if (event.kind === 'stream_started' || event.kind === 'stream_restarted') {
        const stream = { index: streams.length, channel: event.channel, streamId: event.streamId, samples: [] };
        streams.push(stream);
        currentStream.set(event.channel, stream);
      }
    }
    const stream = currentStream.get(packet.channel);
    for (const sample of result.samples) {
      samples.push(sample);
      stream.samples.push(sample);
    }
  });

  return {
    counts,
    invalid,
    deviceErrors,
    diagnostics,
    info: infos.at(-1) ?? null,
    infoCount: infos.length,
    events,
    samples,
    streams: streams.map((s) => ({ index: s.index, channel: s.channel, streamId: s.streamId, samples: s.samples })),
    ranges: [...rangesSeen],
    stats: statistics(samples, streams),
  };
}

function statistics(samples, streams) {
  if (samples.length === 0) return null;
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  const magnitude = (v) => Math.hypot(v[0], v[1], v[2]);
  // Device time is only comparable within one stream: a reboot restarts the clock. Durations and the rate are summed
  // over streams, never measured across a boundary.
  let spanMs = 0;
  let intervals = 0;
  for (const stream of streams) {
    if (stream.samples.length < 2) continue;
    spanMs += stream.samples.at(-1).timestamp_ms - stream.samples[0].timestamp_ms;
    intervals += stream.samples.length - 1;
  }
  const spanS = spanMs / 1000;
  const accelMag = samples.map((s) => magnitude(s.accel_m_s2));
  const gyroMag = samples.map((s) => magnitude(s.gyro_rad_s));
  const axisMean = (key) => [0, 1, 2].map((k) => mean(samples.map((s) => s[key][k])));
  return {
    sampleCount: samples.length,
    spanS,
    streamCount: streams.length,
    rateHz: spanS > 0 ? intervals / spanS : null,
    accelMeanMS2: axisMean('accel_m_s2'),
    accelMagnitudeMS2: { mean: mean(accelMag), min: Math.min(...accelMag), max: Math.max(...accelMag) },
    gyroMeanRadS: axisMean('gyro_rad_s'),
    gyroMagnitudeDegS: { mean: (mean(gyroMag) * 180) / Math.PI, max: (Math.max(...gyroMag) * 180) / Math.PI },
    saturated: samples.filter((s) => s.quality_flags.includes('saturated')).length,
    gapFlagged: samples.filter((s) => s.quality_flags.includes('sample_gap')).length,
  };
}

const f = (n, digits = 2) => (n === null || n === undefined ? '–' : n.toFixed(digits));

export function formatSummary(summary) {
  const { counts, info, stats } = summary;
  const out = [];
  out.push('Capture summary (decoded with @repone/sensor-protocol; nothing here is a calibration)');
  out.push(
    `Lines: ${counts.lines} · sample packets ${counts.samplePackets} · device info ${counts.infoPackets} · device errors ${counts.deviceErrors} · diagnostics ${counts.diagnostics} · unreadable ${counts.invalid}`,
  );
  if (info) {
    out.push(
      `Device: serial ${info.deviceSerial} · firmware ${info.firmwareVersion.major}.${info.firmwareVersion.minor} · ${info.nominalRateHz} Hz nominal · ${info.channelCount} IMU · status ${info.status}`,
    );
  } else {
    out.push('Device: no device-info packet in the capture (it is sent at boot and periodically)');
  }
  for (const d of summary.diagnostics) out.push(`  # ${d}`);
  for (const e of summary.deviceErrors.slice(0, 10)) out.push(`  E ${e.status} on line ${e.line}: ${e.text}`);
  for (const i of summary.invalid) {
    // The codec refuses an all-zero serial: the sketch was flashed without its own IMU_DEVICE_SERIAL.
    const hint = /serial/i.test(i.reason) ? ' → set IMU_DEVICE_SERIAL in firmware/uno-usb/device_config.h and re-flash' : '';
    out.push(`  unreadable line ${i.line}: ${i.reason} (${i.text})${hint}`);
  }
  const eventText = Object.entries(summary.events).map(([k, v]) => `${k} ${v}`).join(' · ');
  out.push(`Stream: ${eventText || 'no sample packets'}`);
  if (stats) {
    out.push(
      `Samples: ${stats.sampleCount} in ${stats.streamCount} stream${stats.streamCount === 1 ? '' : 's'}, ${f(stats.spanS, 1)} s of device time → ${f(stats.rateHz, 1)} Hz measured (within each stream)`,
    );
    out.push(`Full-scale codes (accel/gyro): ${summary.ranges.join(', ')}`);
    out.push(
      `Accel mean (m/s²): x ${f(stats.accelMeanMS2[0])} · y ${f(stats.accelMeanMS2[1])} · z ${f(stats.accelMeanMS2[2])} · |a| mean ${f(stats.accelMagnitudeMS2.mean)} (min ${f(stats.accelMagnitudeMS2.min)}, max ${f(stats.accelMagnitudeMS2.max)})`,
    );
    out.push(
      `Gyro mean (rad/s): x ${f(stats.gyroMeanRadS[0], 3)} · y ${f(stats.gyroMeanRadS[1], 3)} · z ${f(stats.gyroMeanRadS[2], 3)} · |ω| mean ${f(stats.gyroMagnitudeDegS.mean, 1)} °/s (max ${f(stats.gyroMagnitudeDegS.max, 1)} °/s)`,
    );
    out.push(`Flags: saturated ${stats.saturated} · first-after-gap ${stats.gapFlagged}`);
    out.push('What to expect: lying still, |a| ≈ 9.8 m/s² on one axis and |ω| near 0 °/s; moving it changes both.');
  }
  return out.join('\n');
}

/** Every sample in SI units. `stream` numbers the streams in capture order: device time restarts with each one. */
export function samplesToCsv(streams) {
  const rows = ['stream,channel,timestamp_ms,ax_m_s2,ay_m_s2,az_m_s2,gx_rad_s,gy_rad_s,gz_rad_s,flags'];
  for (const stream of streams) {
    for (const s of stream.samples) {
      rows.push(
        [stream.index, stream.channel, s.timestamp_ms, ...s.accel_m_s2.map((v) => v.toFixed(5)), ...s.gyro_rad_s.map((v) => v.toFixed(6)), s.quality_flags.join('|')].join(','),
      );
    }
  }
  return `${rows.join('\n')}\n`;
}

const isMain = process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname;
if (isMain) {
  const args = process.argv.slice(2);
  const csvAt = args.indexOf('--csv');
  const csvPath = csvAt >= 0 ? args[csvAt + 1] : null;
  const input = args.find((a, i) => !a.startsWith('--') && (csvAt < 0 || i !== csvAt + 1));
  if (!input || (csvAt >= 0 && !csvPath)) {
    console.error('Usage: npm run decode:serial -- <capture.txt> [--csv <samples.csv>]');
    process.exit(2);
  }
  const summary = decodeCapture(readFileSync(input, 'utf8'));
  console.log(formatSummary(summary));
  if (csvPath) {
    writeFileSync(csvPath, samplesToCsv(summary.streams));
    console.log(`Wrote ${summary.samples.length} samples to ${csvPath}`);
  }
  // A capture often starts mid-line, so unreadable lines are reported above, not fatal. No samples at all is.
  process.exit(summary.samples.length > 0 ? 0 : 1);
}
