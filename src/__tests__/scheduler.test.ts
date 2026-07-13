// =============================================================================
// DeterministicScheduler tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { VirtualClock } from '../clock/virtual-clock.js';
import { DeterministicScheduler } from '../scheduler/scheduler.js';
import type { FixtureEvent } from '../types.js';

function makeEvents(): FixtureEvent[] {
  return [
    { at: 100, type: 'session_start', sessionDir: '/tmp/test' },
    { at: 200, type: 'activity', content: 'hello' },
    { at: 300, type: 'done', content: 'finished' },
  ];
}

describe('DeterministicScheduler', () => {
  describe('event ordering', () => {
    it('fires fixture events at the correct times', () => {
      const clock = new VirtualClock();
      const log: Array<{ event: string; time: number }> = [];
      const events = makeEvents();

      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 10000,
        onEvent: (e, t) =>
          log.push({ event: typeof e === 'string' ? e : e.type, time: t }),
      });

      scheduler.advance();
      scheduler.advance();

      expect(log[0]).toEqual({ event: 'session_start', time: 100 });
      expect(log[1]).toEqual({ event: 'activity', time: 200 });
    });

    it('preserves file order for same-timestamp events', () => {
      const clock = new VirtualClock();
      const log: string[] = [];
      const events: FixtureEvent[] = [
        { at: 100, type: 'activity', content: 'first' },
        { at: 100, type: 'done', content: 'second' },
      ];

      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 10000,
        onEvent: (e) => {
          if (typeof e !== 'string') log.push(e.content ?? e.type);
        },
      });

      scheduler.advance();

      expect(log).toEqual(['first', 'second']);
    });
  });

  describe('advance()', () => {
    it('returns null when no events remain', () => {
      const clock = new VirtualClock();
      const scheduler = new DeterministicScheduler({
        clock,
        events: [],
        pollIntervalMs: 10000,
        onEvent: () => {},
      });

      expect(scheduler.advance()).toBeNull();
    });

    it('processes all events then returns null', () => {
      const clock = new VirtualClock();
      let count = 0;
      const events = makeEvents();

      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 10000,
        onEvent: () => { count++; },
      });

      scheduler.advance(); // session_start
      scheduler.advance(); // activity
      scheduler.advance(); // done
      expect(count).toBe(3);

      expect(scheduler.advance()).toBeNull();
    });
  });

  describe('frame causes', () => {
    it('classifies reload events', () => {
      const clock = new VirtualClock();
      const events: FixtureEvent[] = [
        { at: 100, type: 'reload', preserve: ['ui'] },
      ];

      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 10000,
        onEvent: () => {},
      });

      expect(scheduler.advance()).toBe('reload');
    });

    it('classifies resize events', () => {
      const clock = new VirtualClock();
      const events: FixtureEvent[] = [
        { at: 100, type: 'resize', cols: 80, rows: 24 },
      ];

      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 10000,
        onEvent: () => {},
      });

      expect(scheduler.advance()).toBe('resize');
    });

    it('classifies poll events', () => {
      const clock = new VirtualClock();
      const events: FixtureEvent[] = [
        { at: 500, type: 'activity', content: 'later' },
      ];
      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 100,
        onEvent: () => {},
      });

      expect(scheduler.advance()).toBe('poll');
    })

    it('classifies theme_changed events', () => {
      const clock = new VirtualClock();
      const events: FixtureEvent[] = [
        { at: 100, type: 'theme_changed', theme: 'dark' },
      ];

      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 10000,
        onEvent: () => {},
      });

      expect(scheduler.advance()).toBe('theme_change');
    });

    it('classifies regular events as fixture_event', () => {
      const clock = new VirtualClock();
      const events: FixtureEvent[] = [
        { at: 100, type: 'activity', content: 'test' },
      ];

      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 10000,
        onEvent: () => {},
      });

      expect(scheduler.advance()).toBe('fixture_event');
    });
  });

  describe('frame count', () => {
    it('increments frame count', () => {
      const clock = new VirtualClock();
      const events = makeEvents();

      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 10000,
        onEvent: () => {},
      });

      expect(scheduler.getFrameCount()).toBe(0);
      scheduler.advance();
      expect(scheduler.getFrameCount()).toBe(1);
      scheduler.advance();
      expect(scheduler.getFrameCount()).toBe(2);
    });
  });

  describe('runUntilIdle()', () => {
    it('processes all events', () => {
      const clock = new VirtualClock();
      const log: string[] = [];
      const events = makeEvents();

      const scheduler = new DeterministicScheduler({
        clock,
        events,
        pollIntervalMs: 10000,
        onEvent: (e) => {
          if (typeof e !== 'string') log.push(e.type);
        },
      });

      scheduler.runUntilIdle();
      expect(log).toContain('session_start');
      expect(log).toContain('activity');
      expect(log).toContain('done');
      expect(log.length).toBe(3);
    });
  });
});
