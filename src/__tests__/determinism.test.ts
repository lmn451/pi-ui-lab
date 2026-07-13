import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FixtureLoader } from '../fixtures/fixture-loader.js';
import { sortEvents } from '../fixtures/event-normalizer.js';
import type { Fixture, FixtureEvent } from '../types.js';

const FIXTURES_DIR = join(process.cwd(), 'fixtures');

async function listFixtureFiles(): Promise<string[]> {
  const { readdirSync, statSync } = await import('node:fs');
  const results: string[] = [];

  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.json')) {
        results.push(fullPath);
      }
    }
  }

  walk(FIXTURES_DIR);
  return results;
}

function normalizeForComparison(events: FixtureEvent[]): string {
  return JSON.stringify(events.map((e) => ({ ...e })));
}

describe('Determinism', () => {
  const loader = new FixtureLoader();

  it('loading the same fixture twice produces identical normalized events', async () => {
    const fixtureFiles = await listFixtureFiles();
    expect(fixtureFiles.length).toBeGreaterThan(0);

    for (const filePath of fixtureFiles) {
      const content = await readFile(filePath, 'utf-8');

      const first = await loader.loadFromString(content);
      const second = await loader.loadFromString(content);

      expect(
        normalizeForComparison(first.timeline),
        `Fixture ${filePath}: two loads produced different timelines`,
      ).toBe(normalizeForComparison(second.timeline));
    }
  });

  it('FixtureLoader.normalizeEvents is idempotent', async () => {
    const fixtureFiles = await listFixtureFiles();
    expect(fixtureFiles.length).toBeGreaterThan(0);

    for (const filePath of fixtureFiles) {
      const content = await readFile(filePath, 'utf-8');
      const fixture = JSON.parse(content) as Fixture;

      const once = loader.normalizeEvents(fixture.timeline);
      const twice = loader.normalizeEvents(once);

      expect(
        normalizeForComparison(once),
        `Fixture ${filePath}: normalizeEvents is not idempotent`,
      ).toBe(normalizeForComparison(twice));
    }
  });

  it('sortEvents produces consistent results for shuffled input', async () => {
    const fixtureFiles = await listFixtureFiles();
    expect(fixtureFiles.length).toBeGreaterThan(0);

    for (const filePath of fixtureFiles) {
      const content = await readFile(filePath, 'utf-8');
      const fixture = JSON.parse(content) as Fixture;
      const sorted = sortEvents(fixture.timeline);

      // Shuffle and re-sort
      const shuffled = [...fixture.timeline].reverse();
      const reSorted = sortEvents(shuffled);

      expect(
        normalizeForComparison(sorted),
        `Fixture ${filePath}: sortEvents not consistent after shuffle`,
      ).toBe(normalizeForComparison(reSorted));
    }
  });
});
