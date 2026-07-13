import { describe, it, expect } from 'vitest';
import {
  sortEvents,
  validateEventOrdering,
  groupEventsByTime,
  insertReloadEvents,
} from '../fixtures/event-normalizer.js';
import type { FixtureEvent, ReloadEvent } from '../types.js';

const events: FixtureEvent[] = [
  { at: 300, type: 'checkpoint', name: 'c1' },
  { at: 100, type: 'activity', agentId: 'a1' },
  { at: 200, type: 'activity', agentId: 'a2' },
  { at: 100, type: 'session_start' },
];

describe('sortEvents', () => {
  it('sorts by at timestamp ascending', () => {
    const sorted = sortEvents(events);
    expect(sorted.map((e) => e.at)).toEqual([100, 100, 200, 300]);
  });

  it('returns a new array (no mutation)', () => {
    const sorted = sortEvents(events);
    expect(sorted).not.toBe(events);
  });

  it('preserves original order for equal timestamps (stable)', () => {
    const sorted = sortEvents(events);
    expect(sorted[0].type).toBe('activity');
    expect(sorted[1].type).toBe('session_start');
  });
});

describe('validateEventOrdering', () => {
  it('returns warnings for past events', () => {
    const pastEvents: FixtureEvent[] = [
      { at: 1000, type: 'session_start' },
    ];
    const warnings = validateEventOrdering(pastEvents, 2000);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('before current time');
  });

  it('returns no warnings for future events', () => {
    const futureEvents: FixtureEvent[] = [
      { at: 1000, type: 'session_start' },
    ];
    const warnings = validateEventOrdering(futureEvents, 0);
    expect(warnings.length).toBe(0);
  });
});

describe('groupEventsByTime', () => {
  it('groups events with same timestamp', () => {
    const grouped = groupEventsByTime(events);
    expect(grouped.size).toBe(3);
    expect(grouped.get(100)!.length).toBe(2);
    expect(grouped.get(200)!.length).toBe(1);
    expect(grouped.get(300)!.length).toBe(1);
  });
});

describe('insertReloadEvents', () => {
  it('inserts reload events at correct positions', () => {
    const base: FixtureEvent[] = [
      { at: 100, type: 'session_start' },
      { at: 300, type: 'activity', agentId: 'a1' },
    ];
    const reloads: ReloadEvent[] = [
      { at: 200, type: 'reload', preserve: ['state'] },
    ];
    const result = insertReloadEvents(base, reloads);
    expect(result.length).toBe(3);
    expect(result[1].type).toBe('reload');
    expect(result[1].at).toBe(200);
  });

  it('appends reloads after all events', () => {
    const base: FixtureEvent[] = [
      { at: 100, type: 'session_start' },
    ];
    const reloads: ReloadEvent[] = [
      { at: 500, type: 'reload', preserve: [] },
    ];
    const result = insertReloadEvents(base, reloads);
    expect(result.length).toBe(2);
    expect(result[1].at).toBe(500);
  });
});
