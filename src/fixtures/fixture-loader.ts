// Fixture loader
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { Fixture, FixtureEvent } from '../types.js';
import { validateFixture, validateFixtureEvent } from '../schema/validate.js';
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
      if (!isRecord(imp) || typeof imp.source !== 'string') {
        throw new Error(`Invalid fixture import entry: expected { source: string }`);
      }
      if (isAbsolute(imp.source)) {
        throw new Error(`Invalid fixture import path '${imp.source}': absolute paths are not allowed`);
      }
      const rel = this.safeRelative(imp.source);
      const filePath = resolve(dir, rel);
      if (relative(dir, filePath).startsWith('..')) {
        throw new Error(`Invalid fixture import path '${imp.source}': path escapes fixture directory`);
      }
      const content = await readFile(filePath, 'utf-8');
      const data: unknown = JSON.parse(content);
      const events = Array.isArray(data)
        ? data
        : isRecord(data) && Array.isArray(data.timeline) ? data.timeline : undefined;
      if (!events) throw new Error(`Invalid fixture import ${filePath}: expected an event array or timeline`);
      for (const [index, event] of events.entries()) {
        const result = validateFixtureEvent(event);
        if (!result.valid) {
          throw new Error(`Invalid fixture import ${filePath} event ${index}: ${result.errors?.join(', ')}`);
        }
        imported.push(event as FixtureEvent);
      }
    }
    return imported;
  }

  private safeRelative(path: string): string {
    const normalized = path.replaceAll('\\', '/');
    if (!normalized || normalized.startsWith('/')) {
      throw new Error(`Invalid fixture import path '${path}': must be a relative path`);
    }
    if (normalized.startsWith('../') || normalized.endsWith('/..') || normalized.includes('/../')) {
      throw new Error(`Invalid fixture import path '${path}': path traversal is not allowed`);
    }
    const segments = normalized.split('/').filter(Boolean);
    if (segments.includes('..')) {
      throw new Error(`Invalid fixture import path '${path}': path traversal is not allowed`);
    }
    const cleaned = segments.filter((segment) => segment !== '.');
    if (cleaned.length === 0) {
      throw new Error(`Invalid fixture import path '${path}': must reference a file`);
    }
    return cleaned.join('/');
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
