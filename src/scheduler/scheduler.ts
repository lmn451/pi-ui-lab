// =============================================================================
// DeterministicScheduler — combines fixture events with virtual clock timers
// =============================================================================

import type { FixtureEvent, FrameCause } from '../types.js';
import type { VirtualClock } from '../clock/virtual-clock.js';

export interface SchedulerOptions {
  clock: VirtualClock;
  events: FixtureEvent[];
  /** Poll interval in ms — a poll event fires every interval (default: 500) */
  pollIntervalMs?: number;
  onEvent: (event: FixtureEvent | 'timer' | 'poll', timeMs: number) => void;
}

type ScheduledEntry = {
  type: 'fixture';
  event: FixtureEvent;
  order: number;
};

type TimerEntry = {
  type: 'timer';
  timeMs: number;
};

type PollEntry = {
  type: 'poll';
  timeMs: number;
};

type QueueEntry = ScheduledEntry | TimerEntry | PollEntry;

export class DeterministicScheduler {
  private clock: VirtualClock;
  private fixtureQueue: ScheduledEntry[];
  private pollIntervalMs: number;
  private nextPollTime: number;
  private onEvent: SchedulerOptions['onEvent'];
  private frameCount = 0;
  private currentIndex = 0;

  constructor(opts: SchedulerOptions) {
    this.clock = opts.clock;
    this.pollIntervalMs = opts.pollIntervalMs ?? 500;
    this.onEvent = opts.onEvent;

    this.fixtureQueue = opts.events
      .map((event, order) => ({ type: 'fixture' as const, event, order }))
      .sort((a, b) => a.event.at - b.event.at || a.order - b.order);

    this.nextPollTime = this.clock.now() + this.pollIntervalMs;
  }

  /** Advance to the next event batch, execute it, return the cause. */
  advance(): FrameCause | null {
    const nextTime = this.findNextTime();
    if (nextTime === null) return null;
    const timerDue = this.clock.getPendingTimers().some((timer) => timer.fireAt <= nextTime);
    this.clock.advanceTo(nextTime);
    const entries = this.collectDueEntries(timerDue);
    if (entries.length === 0) return null;
    const cause = this.classifyCause(entries);
    this.processEntries(entries);
    this.frameCount++;
    return cause;
  }

  /** Timestamp of the next action without consuming it. */
  peekNextTime(): number | null {
    return this.findNextTime();
  }

  /** Run all remaining events and timers. */
  runUntilIdle(): void {
    let safety = 0;
    const MAX_ITERATIONS = 50_000;
    while (safety++ < MAX_ITERATIONS) {
      if (this.advance() === null) break;
    }
  }

  /** Current frame counter. */
  getFrameCount(): number {
    return this.frameCount;
  }

  // -- Internal --------------------------------------------------------------

  /** Find the earliest time any event is waiting. */
  private findNextTime(): number | null {
    const time = this.clock.now();
    const candidates: number[] = [];

    // Next fixture event
    if (this.currentIndex < this.fixtureQueue.length) {
      candidates.push(this.fixtureQueue[this.currentIndex].event.at);
    }

    // Next virtual-clock timer
    const nextTimer = this.clock.getPendingTimers()[0];
    if (nextTimer) candidates.push(nextTimer.fireAt);

    // Only poll if there are still pending events
    if (this.hasMoreEvents()) {
      candidates.push(this.nextPollTime);
    }

    if (candidates.length === 0) return null;
    const earliest = Math.min(...candidates);
    return earliest <= time ? time : earliest;
  }

  /** Collect all entries due at the current clock time. */
  private collectDueEntries(timerDue: boolean): QueueEntry[] {
    const time = this.clock.now();
    const entries: QueueEntry[] = [];

    // 1. Fixture events (stable order for same timestamp)
    while (
      this.currentIndex < this.fixtureQueue.length &&
      this.fixtureQueue[this.currentIndex].event.at <= time
    ) {
      entries.push(this.fixtureQueue[this.currentIndex]);
      this.currentIndex++;
    }

    // 2. Virtual-clock timers execute inside clock.advanceTo().
    if (timerDue) entries.push({ type: 'timer', timeMs: time });

    // 3. Poll ticks — only if more events remain
    if (this.hasMoreEvents() && time >= this.nextPollTime) {
      entries.push({ type: 'poll', timeMs: this.nextPollTime });
      this.nextPollTime = time + this.pollIntervalMs;
    }

    return entries;
  }

  private processEntries(entries: QueueEntry[]): void {
    const time = this.clock.now();
    for (const entry of entries) {
      if (entry.type === 'fixture') {
        this.onEvent(entry.event, time);
      } else if (entry.type === 'timer') {
        this.onEvent('timer', time);
      } else {
        this.onEvent('poll', time);
      }
    }
  }

  private classifyCause(entries: QueueEntry[]): FrameCause {
    if (entries.some((e) => e.type === 'poll')) return 'poll';
    const first = entries[0];
    if (first.type === 'fixture') {
      return causeFromEventType(first.event.type);
    }
    return 'fixture_event';
  }

  private hasMoreEvents(): boolean {
    return (
      this.currentIndex < this.fixtureQueue.length ||
      this.clock.getPendingTimers().length > 0
    );
  }
}

function causeFromEventType(type: FixtureEvent['type']): FrameCause {
  switch (type) {
    case 'reload':
      return 'reload';
    case 'resize':
      return 'resize';
    case 'theme_changed':
      return 'theme_change';
    case 'poll':
      return 'poll';
    default:
      return 'fixture_event';
  }
}

export function createScheduler(opts: SchedulerOptions): DeterministicScheduler {
  return new DeterministicScheduler(opts);
}
