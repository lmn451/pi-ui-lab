// Event normalization utilities
import type { FixtureEvent, ReloadEvent } from '../types.js';

/**
 * Stable sort of events by `at` timestamp.
 */
export function sortEvents(events: FixtureEvent[]): FixtureEvent[] {
  return [...events]
    .map((event, index) => ({ event, index }))
    .sort((left, right) => left.event.at - right.event.at || left.index - right.index)
    .map(({ event }) => event);
}

/**
 * Returns warnings for events with `at` before current time.
 */
export function validateEventOrdering(events: FixtureEvent[], currentTime = 0): string[] {
  return events
    .filter((e) => e.at < currentTime)
    .map((e) => `Event at ${e.at} is before current time (${currentTime})`);
}

/**
 * Groups events sharing a timestamp.
 */
export function groupEventsByTime(events: FixtureEvent[]): Map<number, FixtureEvent[]> {
  const map = new Map<number, FixtureEvent[]>();
  for (const event of events) {
    const group = map.get(event.at);
    if (group) {
      group.push(event);
    } else {
      map.set(event.at, [event]);
    }
  }
  return map;
}

/**
 * Merge reload events preserving order.
 */
export function insertReloadEvents(
  events: FixtureEvent[],
  reloads: ReloadEvent[],
): FixtureEvent[] {
  const result = [...events];
  for (const reload of reloads) {
    const idx = result.findIndex((e) => e.at > reload.at);
    if (idx === -1) {
      result.push(reload);
    } else {
      result.splice(idx, 0, reload);
    }
  }
  return sortEvents(result);
}
