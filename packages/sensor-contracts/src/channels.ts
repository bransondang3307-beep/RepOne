import type { Unsubscribe } from './common';
import type { DeviceChannel } from './device';
import type { RawSensorSample } from './sensor';

/**
 * Two channels in one session carry the same `source_id`, so their samples could not be told apart
 * (ADR 0007 §2). Raised before anything is recorded.
 */
export class ChannelCollisionError extends Error {
  constructor(readonly duplicateSourceIds: readonly string[]) {
    super(`Sensor channels in one session need distinct source_ids; duplicated: ${duplicateSourceIds.join(', ')}`);
    this.name = 'ChannelCollisionError';
  }
}

/** The channels of one session, checked to be distinct. */
export interface SessionChannels {
  readonly channels: readonly DeviceChannel[];
  readonly sourceIds: readonly string[];
  /**
   * Every channel's samples. A sample must carry the `source_id` of the channel that delivered it: one that
   * carries any other id is dropped and counted, never attributed to another sensor.
   */
  subscribe(listener: (sample: RawSensorSample) => void): Unsubscribe;
  /** Dropped samples per delivering channel's `source_id`. */
  misattributedSampleCounts(): ReadonlyMap<string, number>;
}

/**
 * Combine channels — from one device or several — into one session (ADR 0007 §2, owner decision 2026-10-23:
 * `source_id` is the sensor identity, and distinct sensors must not collide within a session). Throws
 * `ChannelCollisionError` if two channels share a `source_id`.
 */
export function combineChannels(channels: readonly DeviceChannel[]): SessionChannels {
  if (channels.length === 0) throw new Error('A session needs at least one sensor channel');
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { source_id } of channels) {
    if (seen.has(source_id)) duplicates.add(source_id);
    seen.add(source_id);
  }
  if (duplicates.size > 0) throw new ChannelCollisionError([...duplicates].sort());

  const misattributed = new Map<string, number>();
  return {
    channels: [...channels],
    sourceIds: channels.map((c) => c.source_id),
    subscribe(listener) {
      const unsubscribers = channels.map((channel) =>
        channel.source.subscribe((sample) => {
          if (sample.source_id !== channel.source_id) {
            misattributed.set(channel.source_id, (misattributed.get(channel.source_id) ?? 0) + 1);
            return;
          }
          listener(sample);
        }),
      );
      return () => unsubscribers.forEach((u) => u());
    },
    misattributedSampleCounts: () => new Map(misattributed),
  };
}
