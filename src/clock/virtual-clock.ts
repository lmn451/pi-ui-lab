// =============================================================================
// VirtualClock — deterministic, manually-advanced clock for testing
// =============================================================================

import type { Clock, TimerHandle } from '../types.js';

export interface VirtualClockOptions {
  /** Starting time in ms (default 0) */
  startTime?: number;
  /** Max steps before throwing (default 10_000) */
  maxSteps?: number;
  /** Max virtual duration in ms (default 3_600_000 = 1 hour) */
  maxDuration?: number;
}

interface PendingTimer {
  id: number;
  fireAt: number;
  callback: () => void;
}

const DEFAULT_MAX_STEPS = 10_000;
const DEFAULT_MAX_DURATION = 3_600_000;
const TIMER_LOOP_THRESHOLD = 100;

export class VirtualClock implements Clock {
  private currentTime: number;
  private startTime: number;
  private maxSteps: number;
  private maxDuration: number;
  private nextId = 1;
  private timers: PendingTimer[] = [];
  private timestampExecutions = new Map<number, number>();
  private totalSteps = 0;

  constructor(opts: VirtualClockOptions = {}) {
    this.currentTime = opts.startTime ?? 0;
    this.startTime = this.currentTime;
    this.maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
    this.maxDuration = opts.maxDuration ?? DEFAULT_MAX_DURATION;
  }

  // -- Clock interface -------------------------------------------------------

  now(): number {
    return this.currentTime;
  }

  setTimeout(callback: () => void, delayMs: number): TimerHandle {
    if (!Number.isFinite(delayMs)) throw new RangeError('Timer delay must be finite');
    const id = this.nextId++;
    const fireAt = this.currentTime + Math.max(0, delayMs);
    this.timers.push({ id, fireAt, callback });
    this.timers.sort((a, b) => a.fireAt - b.fireAt || a.id - b.id);
    return { id };
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers = this.timers.filter((t) => t.id !== handle.id);
  }

  // -- Virtual control -------------------------------------------------------

  /** Advance to the next pending timer, fire it, return the new time. */
  step(): number {
    this.checkStepLimit();
    const next = this.timers.shift();
    if (!next) {
      return this.currentTime;
    }
    this.checkMaxDuration(next.fireAt);
    this.currentTime = next.fireAt;
    this.detectLoop(this.currentTime);
    next.callback();
    return this.currentTime;
  }

  /** Advance to a target time, firing all timers in [current, timeMs]. */
  advanceTo(timeMs: number): void {
    if (timeMs < this.currentTime) {
      throw new Error(
        `advanceTo(${timeMs}) is before current time ${this.currentTime}`,
      );
    }
    this.checkMaxDuration(timeMs);
    while (this.timers.length > 0 && this.timers[0].fireAt <= timeMs) {
      this.checkStepLimit();
      const next = this.timers.shift()!;
      this.currentTime = next.fireAt;
      this.detectLoop(this.currentTime);
      next.callback();
    }
    this.currentTime = timeMs;
  }

  /** Run until no timers remain. */
  runUntilIdle(): void {
    while (this.timers.length > 0) {
      this.step();
    }
  }

  /** Return a shallow copy of pending timers for diagnostics. */
  getPendingTimers(): Array<{ id: number; fireAt: number }> {
    return this.timers.map(({ id, fireAt }) => ({ id, fireAt }));
  }

  /** Reset all state (useful between tests). */
  reset(startTime?: number): void {
    this.currentTime = startTime ?? 0;
    this.startTime = this.currentTime;
    this.timers = [];
    this.timestampExecutions.clear();
    this.totalSteps = 0;
    this.nextId = 1;
  }

  // -- Internal guards -------------------------------------------------------

  private checkStepLimit(): void {
    this.totalSteps++;
    if (this.totalSteps > this.maxSteps) {
      throw new Error(
        `VirtualClock exceeded max steps (${this.maxSteps}). Possible infinite loop.`,
      );
    }
  }

  private checkMaxDuration(timeMs: number): void {
    if (timeMs - this.startTime > this.maxDuration) {
      throw new Error(
        `VirtualClock exceeded max duration (${this.maxDuration}ms).`,
      );
    }
  }

  private detectLoop(timestamp: number): void {
    const count = (this.timestampExecutions.get(timestamp) ?? 0) + 1;
    this.timestampExecutions.set(timestamp, count);
    if (count > TIMER_LOOP_THRESHOLD) {
      throw new Error(
        `VirtualClock detected timer loop: timestamp ${timestamp} executed ${count} times.`,
      );
    }
  }
}

export function createVirtualClock(
  opts?: VirtualClockOptions,
): VirtualClock {
  return new VirtualClock(opts);
}
