import type { Scheduler } from '../common';

/** Deterministic Scheduler: intervals fire only when `advance()` is called. */
export class ManualScheduler implements Scheduler {
  private nextHandle = 1;
  private readonly timers = new Map<number, { callback: () => void; intervalMs: number; dueMs: number }>();
  private nowMs = 0;

  setInterval(callback: () => void, intervalMs: number): unknown {
    const handle = this.nextHandle++;
    this.timers.set(handle, { callback, intervalMs, dueMs: this.nowMs + intervalMs });
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  get activeTimers(): number {
    return this.timers.size;
  }

  advance(ms: number): void {
    const target = this.nowMs + ms;
    for (;;) {
      let next: [number, { callback: () => void; intervalMs: number; dueMs: number }] | undefined;
      for (const entry of this.timers)
        if (entry[1].dueMs <= target && (!next || entry[1].dueMs < next[1].dueMs)) next = entry;
      if (!next) break;
      const [, timer] = next;
      this.nowMs = timer.dueMs;
      timer.dueMs += timer.intervalMs;
      timer.callback();
    }
    this.nowMs = target;
  }
}
