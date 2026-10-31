import type { RawSensorSample } from '@repone/sensor-contracts';
import type { SamplePacket } from './packets';
import { accelVecToMS2, gyroVecToRadS, isSaturated } from './units';

const U16 = 0x10000;
const U32 = 0x100000000;

/** Things a transport adapter may need to act on; samples are returned separately. */
export type StreamEvent =
  | { readonly kind: 'stream_started'; readonly channel: number; readonly streamId: number }
  /** A new stream replaced the current one: the device restarted streaming (e.g. it rebooted) mid-run. */
  | { readonly kind: 'stream_restarted'; readonly channel: number; readonly previousStreamId: number; readonly streamId: number }
  /** A packet from no current stream (before any stream start, or an old stream id); dropped. */
  | { readonly kind: 'stale_packet'; readonly channel: number; readonly streamId: number }
  /** A packet whose sequence is behind the stream (repeated or out of order); dropped. */
  | { readonly kind: 'duplicate_packet'; readonly channel: number; readonly firstSequence: number }
  /** Sequence numbers were skipped: this many samples never arrived. The next sample is flagged `sample_gap`. */
  | { readonly kind: 'samples_lost'; readonly channel: number; readonly count: number }
  /** The device reported dropping samples before this packet (count unknown); the next sample is flagged. */
  | { readonly kind: 'device_overflow'; readonly channel: number }
  /** A sample's device time went backwards without a clock wrap; dropped, and the next sample is flagged. */
  | { readonly kind: 'time_went_backwards'; readonly channel: number; readonly deviceTimeMs: number };

export interface TrackResult {
  readonly samples: RawSensorSample[];
  readonly events: StreamEvent[];
}

export interface StreamTrackerOptions {
  /** The contract `source_id` of a device channel: stable per physical IMU (ADR 0007 §2). */
  sourceIdFor(channel: number): string;
}

interface ChannelStream {
  streamId: number;
  nextSequence: number;
  lastRawTimeMs: number | null;
  wraps: number;
}

/**
 * Turns decoded sample packets into contract samples for one device connection (ADR 0008):
 * - explicit unit conversion (raw counts → m/s², rad/s) with the packet's own full-scale codes;
 * - one stream per channel, started by a stream-start packet; anything else is stale and dropped;
 * - u16 sequence numbers detect lost and repeated packets across wrap-around;
 * - the u32 device clock is unwrapped, so `timestamp_ms` never decreases within a stream;
 * - `sample_gap` marks the first sample after any loss, `saturated` a reading at the converter's limit.
 * It never invents or interpolates samples, and never marks data `synthetic`: the source decides provenance.
 */
export class StreamTracker {
  private readonly streams = new Map<number, ChannelStream>();

  constructor(private readonly options: StreamTrackerOptions) {}

  /** Forget every stream. Call when the connection or subscription ends, so old packets can't mix into a new run. */
  reset(): void {
    this.streams.clear();
  }

  currentStreamId(channel: number): number | null {
    return this.streams.get(channel)?.streamId ?? null;
  }

  accept(packet: SamplePacket): TrackResult {
    const events: StreamEvent[] = [];
    const { channel } = packet;
    let stream = this.streams.get(channel);

    if (packet.streamStart && stream?.streamId !== packet.streamId) {
      if (stream) events.push({ kind: 'stream_restarted', channel, previousStreamId: stream.streamId, streamId: packet.streamId });
      else events.push({ kind: 'stream_started', channel, streamId: packet.streamId });
      stream = { streamId: packet.streamId, nextSequence: packet.firstSequence, lastRawTimeMs: null, wraps: 0 };
      this.streams.set(channel, stream);
    }
    if (!stream || stream.streamId !== packet.streamId) {
      events.push({ kind: 'stale_packet', channel, streamId: packet.streamId });
      return { samples: [], events };
    }

    const ahead = (packet.firstSequence - stream.nextSequence + U16) % U16;
    if (ahead >= U16 / 2) {
      events.push({ kind: 'duplicate_packet', channel, firstSequence: packet.firstSequence });
      return { samples: [], events };
    }
    let gap = false;
    if (ahead > 0) {
      events.push({ kind: 'samples_lost', channel, count: ahead });
      gap = true;
    }
    if (packet.deviceOverflow) {
      events.push({ kind: 'device_overflow', channel });
      gap = true;
    }

    const sourceId = this.options.sourceIdFor(channel);
    const samples: RawSensorSample[] = [];
    for (const wire of packet.samples) {
      let wraps = stream.wraps;
      if (stream.lastRawTimeMs !== null && wire.deviceTimeMs < stream.lastRawTimeMs) {
        if (stream.lastRawTimeMs - wire.deviceTimeMs > U32 / 2) {
          wraps += 1;
        } else {
          events.push({ kind: 'time_went_backwards', channel, deviceTimeMs: wire.deviceTimeMs });
          gap = true;
          continue;
        }
      }
      stream.wraps = wraps;
      stream.lastRawTimeMs = wire.deviceTimeMs;
      const flags: string[] = [];
      if (gap) flags.push('sample_gap');
      if ([...wire.accel, ...wire.gyro].some(isSaturated)) flags.push('saturated');
      gap = false;
      samples.push({
        timestamp_ms: wraps * U32 + wire.deviceTimeMs,
        source_id: sourceId,
        accel_m_s2: accelVecToMS2(wire.accel, packet.accelRange),
        gyro_rad_s: gyroVecToRadS(wire.gyro, packet.gyroRange),
        quality_flags: flags,
      });
    }
    stream.nextSequence = (packet.firstSequence + packet.samples.length) % U16;
    return { samples, events };
  }
}
