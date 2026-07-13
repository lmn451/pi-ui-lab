// Fixture loader
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import type { Fixture, FixtureEvent } from '../types.js';
import { validateFixture } from '../schema/validate.js';
import { sortEvents, validateEventOrdering } from './event-normalizer.js';

export class FixtureLoader {
  async load(path: string): Promise<Fixture> {
    const content = await readFile(path, 'utf-8');
    return this.loadFromString(content, path);
  }

  async loadFromString(json: string, basePath?: string): Promise<Fixture> {
    const data = JSON.parse(json);
    const result = validateFixture(data);
    if (!result.valid) {
      throw new Error(`Validation failed: ${result.errors?.join(', ')}`);
    }
    const fixture = data as Fixture;
    if (basePath) {
      return this.withResolvedImports(fixture, basePath);
    }
    return { ...fixture, timeline: sortEvents(fixture.timeline) };
  }

  async resolveImports(fixture: Fixture, basePath: string): Promise<FixtureEvent[]> {
    const dir = dirname(basePath);
    const imported: FixtureEvent[] = [];
    for (const imp of fixture.imports ?? []) {
      const filePath = resolve(dir, imp.source);
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        imported.push(...(data as FixtureEvent[]));
      } else if (data.timeline) {
        imported.push(...(data.timeline as FixtureEvent[]));
      }
    }
    return imported;
  }

  normalizeEvents(events: FixtureEvent[]): FixtureEvent[] {
    const warnings = validateEventOrdering(events);
    if (warnings.length > 0) {
      console.warn('[fixture-loader]', warnings.join('; '));
    }
    return sortEvents(events);
  }

  private async withResolvedImports(fixture: Fixture, basePath: string): Promise<Fixture> {
    const imported = await this.resolveImports(fixture, basePath);
    const merged = [...fixture.timeline, ...imported];
    return {
      ...fixture,
      timeline: sortEvents(merged),
    };
  }
}
