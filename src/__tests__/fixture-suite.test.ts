import { describe, it, expect, beforeAll } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateFixture } from '../schema/validate.js';
import type { Fixture, FixtureEvent, EventType } from '../types.js';

const FIXTURES_DIR = join(process.cwd(), 'fixtures');

const VALID_EVENT_TYPES: Set<EventType> = new Set([
  'session_start',
  'subagent_started',
  'activity',
  'waiting',
  'done',
  'failed',
  'workflow_updated',
  'artifact_created',
  'artifact_updated',
  'state_written',
  'poll',
  'reload',
  'resize',
  'theme_changed',
  'key',
  'checkpoint',
]);

async function loadAllFixtures(): Promise<{ fixture: Fixture; path: string }[]> {
  const groups = await readdir(FIXTURES_DIR, { withFileTypes: true });
  const results: { fixture: Fixture; path: string }[] = [];

  for (const group of groups) {
    if (!group.isDirectory()) continue;
    const groupDir = join(FIXTURES_DIR, group.name);
    const files = await readdir(groupDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = join(groupDir, file);
      const raw = await readFile(filePath, 'utf-8');
      const fixture = JSON.parse(raw) as Fixture;
      results.push({ fixture, path: filePath });
    }
  }

  // Also include root-level fixtures
  const rootFiles = await readdir(FIXTURES_DIR);
  for (const file of rootFiles) {
    if (!file.endsWith('.json')) continue;
    const filePath = join(FIXTURES_DIR, file);
    const raw = await readFile(filePath, 'utf-8');
    const fixture = JSON.parse(raw) as Fixture;
    results.push({ fixture, path: filePath });
  }

  return results;
}

describe('Fixture suite validation', () => {
  let fixtures: { fixture: Fixture; path: string }[];

  beforeAll(async () => {
    fixtures = await loadAllFixtures();
  });

  it('has at least one fixture loaded', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('all fixtures pass validateFixture()', () => {
    for (const { fixture, path } of fixtures) {
      const result = validateFixture(fixture);
      expect(result.valid, `Fixture ${path} failed validation: ${result.errors?.join(', ')}`).toBe(true);
    }
  });

  it('all fixtures have at least one checkpoint', () => {
    for (const { fixture, path } of fixtures) {
      const hasCheckpoint = fixture.timeline.some((e) => e.type === 'checkpoint');
      expect(hasCheckpoint, `Fixture ${path} has no checkpoint`).toBe(true);
    }
  });

  it('all fixtures have session_start as first event', () => {
    for (const { fixture, path } of fixtures) {
      expect(
        fixture.timeline.length,
        `Fixture ${path} has empty timeline`,
      ).toBeGreaterThan(0);
      expect(
        fixture.timeline[0].type,
        `Fixture ${path} first event is not session_start`,
      ).toBe('session_start');
    }
  });

  it('event timestamps are non-decreasing', () => {
    for (const { fixture, path } of fixtures) {
      for (let i = 1; i < fixture.timeline.length; i++) {
        expect(
          fixture.timeline[i].at,
          `Fixture ${path} event at index ${i} has timestamp ${fixture.timeline[i].at} < previous ${fixture.timeline[i - 1].at}`,
        ).toBeGreaterThanOrEqual(fixture.timeline[i - 1].at);
      }
    }
  });

  it('no fixture has unknown event types', () => {
    for (const { fixture, path } of fixtures) {
      for (const event of fixture.timeline) {
        expect(
          VALID_EVENT_TYPES.has(event.type),
          `Fixture ${path} has unknown event type: ${event.type}`,
        ).toBe(true);
      }
    }
  });
});
