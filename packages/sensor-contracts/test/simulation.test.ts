import { DEMO_LOOP_SCRIPT, GRAVITY_M_S2, LABELLED_SET_SCRIPT, MotionSynthesizer, generateTrace } from '../src';
import { BASE_SIMULATION, labelledSetTrace } from './fixtures';

describe('synthetic trace generation', () => {
  it('is reproducible for a given seed and differs across seeds', () => {
    expect(labelledSetTrace()).toEqual(labelledSetTrace());
    const other = generateTrace(LABELLED_SET_SCRIPT, { ...BASE_SIMULATION, seed: 7 });
    expect(other.samples[10]!.gyro_rad_s).not.toEqual(labelledSetTrace().samples[10]!.gyro_rad_s);
  });

  it('labels every scripted rep with ground truth', () => {
    const { labels, metadata } = labelledSetTrace();
    expect(labels.filter((l) => l.classification === 'full')).toHaveLength(8);
    expect(labels.filter((l) => l.classification === 'partial')).toHaveLength(2);
    expect(metadata.synthetic).toBe(true);
  });

  it('produces samples at the requested rate with explicit units and synthetic flag', () => {
    const { samples } = labelledSetTrace();
    const totalMs = LABELLED_SET_SCRIPT.segments.reduce((t, s) => t + s.durationMs, 0);
    expect(samples).toHaveLength((totalMs / 1000) * 50);
    expect(samples[1]!.timestamp_ms - samples[0]!.timestamp_ms).toBe(20);
    // At rest, flat: gravity on +z (m/s²), ~no rotation (rad/s).
    const first = samples[0]!;
    expect(first.accel_m_s2[2]).toBeCloseTo(GRAVITY_M_S2, 0);
    expect(Math.abs(first.gyro_rad_s[0])).toBeLessThan(0.1);
    expect(first.quality_flags).toContain('synthetic');
  });

  it('drops samples when packet loss is simulated', () => {
    const lossy = generateTrace(LABELLED_SET_SCRIPT, { ...BASE_SIMULATION, dropProbability: 0.1 });
    const ratio = lossy.samples.length / labelledSetTrace().samples.length;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(0.95);
  });

  it('refuses to render a looping script as a finite trace, but synthesises it live', () => {
    expect(() => generateTrace(DEMO_LOOP_SCRIPT, BASE_SIMULATION)).toThrow();
    const synth = new MotionSynthesizer(DEMO_LOOP_SCRIPT, BASE_SIMULATION);
    for (let i = 0; i < 5000; i++) expect(synth.next()).toBeTruthy();
  });
});
