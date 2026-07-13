import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FixtureLoader } from '../fixtures/fixture-loader.js';
import type { Fixture } from '../types.js';

const loader = new FixtureLoader();
const tmpDir = join(process.cwd(), '__test_tmp__');

const fixtureJson: Fixture = {
  version: 1,
  name: 'loader-test',
  viewport: { cols: 80, rows: 24 },
  theme: 'dark',
  pollIntervalMs: 1000,
  timeline: [
    { at: 200, type: 'activity', agentId: 'a1' },
    { at: 100, type: 'session_start' },
  ],
};

beforeEach(async () => {
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  const { unlinkSync } = await import('node:fs');
  try {
    unlinkSync(join(tmpDir, 'fixture.json'));
    unlinkSync(join(tmpDir, 'imported.json'));
    unlinkSync(join(tmpDir, 'bad.json'));
  } catch {
    // ignore
  }
});

describe('FixtureLoader', () => {
  it('loads and validates a fixture from file', async () => {
    const path = join(tmpDir, 'fixture.json');
    await writeFile(path, JSON.stringify(fixtureJson));
    const result = await loader.load(path);
    expect(result.name).toBe('loader-test');
    expect(result.timeline.length).toBe(2);
  });

  it('throws on invalid fixture', async () => {
    const path = join(tmpDir, 'bad.json');
    await writeFile(path, JSON.stringify({ version: 2 }));
    await expect(loader.load(path)).rejects.toThrow('Validation failed');
  });

  it('loads from string and normalizes events', async () => {
    const result = await loader.loadFromString(JSON.stringify(fixtureJson));
    expect(result.timeline[0].at).toBe(100);
    expect(result.timeline[1].at).toBe(200);
  });

  it('does not mutate the input fixture', async () => {
    const original = JSON.stringify(fixtureJson);
    await loader.loadFromString(original);
    const parsed = JSON.parse(original);
    expect(parsed.timeline[0].at).toBe(200);
  });

  it('resolves imports from file', async () => {
    const imported = [{ at: 50, type: 'session_start' }];
    const withImports: Fixture = {
      ...fixtureJson,
      imports: [{ source: 'imported.json' }],
    };
    await writeFile(join(tmpDir, 'imported.json'), JSON.stringify(imported));
    const path = join(tmpDir, 'fixture.json');
    await writeFile(path, JSON.stringify(withImports));
    const result = await loader.load(path);
    expect(result.timeline.length).toBe(3);
    expect(result.timeline[0].at).toBe(50);
  });
});
