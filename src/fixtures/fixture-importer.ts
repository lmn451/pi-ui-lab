import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import type { EventType, Fixture, FixtureEvent } from '../types.js';
import { validateFixture } from '../schema/validate.js';
import { redactEvents, type RedactionOptions } from './redactor.js';
import { sortEvents } from './event-normalizer.js';

export interface FixtureImportOptions extends RedactionOptions {
  session?: string;
  events?: string;
  state?: string;
  artifacts?: string;
  output: string;
  name?: string;
  description?: string;
  viewport?: { cols: number; rows: number };
  theme?: string;
  pollIntervalMs?: number;
}

export interface FixtureImportResult {
  fixture: Fixture;
  fixturePath: string;
  artifactPaths: string[];
}

const EVENT_TYPES = new Set<EventType>([
  'session_start', 'subagent_started', 'activity', 'waiting', 'done', 'failed',
  'workflow_updated', 'artifact_created', 'artifact_updated', 'state_written',
  'poll', 'reload', 'resize', 'theme_changed', 'key', 'checkpoint',
]);

const TYPE_ALIASES: Record<string, EventType> = {
  start: 'session_start', session: 'session_start', session_start: 'session_start',
  subagent_start: 'subagent_started', agent_started: 'subagent_started', subagent_started: 'subagent_started',
  message: 'activity', output: 'activity', log: 'activity', activity: 'activity',
  agent_waiting: 'waiting', waiting: 'waiting', complete: 'done', completed: 'done', done: 'done',
  agent_done: 'done', error: 'failed', failure: 'failed', failed: 'failed',
  workflow_update: 'workflow_updated', workflow_updated: 'workflow_updated',
  artifact_create: 'artifact_created', artifact_created: 'artifact_created',
  artifact_update: 'artifact_updated', artifact_updated: 'artifact_updated',
  state_write: 'state_written', state_written: 'state_written', poll: 'poll',
  reload: 'reload', resize: 'resize', theme_change: 'theme_changed', theme_changed: 'theme_changed',
  key: 'key', checkpoint: 'checkpoint',
};

/** Imports read-only Pi recordings into a portable fixture directory. */
export async function importFixture(options: FixtureImportOptions): Promise<FixtureImportResult> {
  validateImportOptions(options);
  const outputDir = resolve(options.output);
  const sources = sourcePaths(options);
  await assertSafeOutput(outputDir, sources);
  await mkdir(outputDir, { recursive: true });
  const timeline: FixtureEvent[] = [];
  if (options.session) timeline.push(...await readEvents(options.session, 'session'));
  if (options.events) timeline.push(...await readEvents(options.events, 'events'));
  if (options.state) timeline.push(...await readState(options.state));
  const artifactPaths = options.artifacts ? await copyArtifacts(options.artifacts, outputDir) : [];
  timeline.push(...artifactPaths.map((path, index) => ({
    at: index,
    type: 'artifact_created' as const,
    artifactId: path,
    artifactPath: path,
  })));
  const fixture = buildFixture(options, timeline);
  const fixturePath = join(outputDir, 'fixture.json');
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  return { fixture, fixturePath, artifactPaths };
}

export class FixtureImporter {
  import(options: FixtureImportOptions): Promise<FixtureImportResult> {
    return importFixture(options);
  }
}

function validateImportOptions(options: FixtureImportOptions): void {
  const inputCount = [options.session, options.events, options.state, options.artifacts].filter(Boolean).length;
  if (inputCount === 0) throw new Error('At least one input is required (--session, --events, --state, or --artifacts)');
  if (!options.output) throw new Error('An output directory is required (--output)');
}

function sourcePaths(options: FixtureImportOptions): string[] {
  return [options.session, options.events, options.state, options.artifacts]
    .filter((source): source is string => Boolean(source)).map((source) => resolve(source));
}

async function assertSafeOutput(output: string, sources: string[]): Promise<void> {
  const outputParent = dirname(output);
  const canonicalParent = await existingRealpath(outputParent);
  const comparableOutput = canonicalParent ? join(canonicalParent, basename(output)) : output;
  const existingOutput = await existingRealpath(output);
  for (const source of sources) {
    const outputIsWithinSource = isWithin(source, comparableOutput);
    const sourceIsWithinOutput = isWithin(comparableOutput, source);
    if (outputIsWithinSource || sourceIsWithinOutput) {
      throw new Error(`Output directory must not overlap source: ${source}`);
    }
    const sourceReal = await existingRealpath(source);
    if (!sourceReal) continue;
    const sourceStat = await stat(sourceReal);
    const outputIsSource = existingOutput === sourceReal;
    const outputInSource = isWithin(sourceReal, comparableOutput);
    const sourceInOutput = isWithin(comparableOutput, sourceReal);
    if (outputIsSource || outputInSource || (sourceStat.isFile() && sourceInOutput)) {
      throw new Error(`Output directory must not overlap source: ${source}`);
    }
  }
  if (outputParent === output) throw new Error('Invalid output directory');
}

async function existingRealpath(path: string): Promise<string | undefined> {
  try {
    const { realpath } = await import('node:fs/promises');
    return await realpath(path);
  } catch {
    return undefined;
  }
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep));
}

async function readEvents(path: string, sourceType: 'session' | 'events'): Promise<FixtureEvent[]> {
  const source = await readFile(path, 'utf8');
  const records = parseRecords(source, path);
  return records.flatMap((record, index) => normalizeRecord(record, index, sourceType));
}

async function readState(path: string): Promise<FixtureEvent[]> {
  const source = await readFile(path, 'utf8');
  let value: unknown;
  try { value = JSON.parse(source); } catch (error) { throw parseError(path, error); }
  if (isRecord(value) && Array.isArray(value.timeline)) return normalizeRecords(value.timeline, 'state');
  if (isRecord(value) && Array.isArray(value.events)) return normalizeRecords(value.events, 'state');
  return [{ at: 0, type: 'state_written', key: 'state', value }];
}

function parseRecords(source: string, path: string): unknown[] {
  const text = source.trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (isRecord(parsed) && Array.isArray(parsed.timeline)) return parsed.timeline;
    if (isRecord(parsed) && Array.isArray(parsed.events)) return parsed.events;
    return [parsed];
  } catch {
    return source.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
      try { return JSON.parse(line) as unknown; } catch (error) { throw parseError(`${path}:${index + 1}`, error); }
    });
  }
}

function normalizeRecords(records: unknown[], sourceType: string): FixtureEvent[] {
  return records.flatMap((record, index) => normalizeRecord(record, index, sourceType));
}

function normalizeRecord(record: unknown, index: number, sourceType: string): FixtureEvent[] {
  if (!isRecord(record)) throw new Error(`Invalid ${sourceType} event at line ${index + 1}: expected an object`);
  const nested = isRecord(record.data) ? record.data : isRecord(record.payload) ? record.payload : {};
  const source = { ...record, ...nested };
  const rawType = stringValue(source.type) ?? stringValue(source.event) ?? stringValue(source.kind);
  const type = rawType ? (TYPE_ALIASES[rawType] ?? rawType) : undefined;
  if (!type || !EVENT_TYPES.has(type as EventType)) throw new Error(`Unknown event type${rawType ? ` '${rawType}'` : ''} at ${sourceType} line ${index + 1}`);
  const at = eventTime(source, index);
  const event = { ...source, at, type } as Record<string, unknown>;
  delete event.data;
  delete event.payload;
  delete event.event;
  delete event.kind;
  return [completeEvent(event as unknown as FixtureEvent, index)];
}

function completeEvent(event: FixtureEvent, index: number): FixtureEvent {
  const value = event as unknown as Record<string, unknown>;
  if (event.type === 'subagent_started') {
    value.agentId ??= stringValue(value.id) ?? `agent-${index}`;
    value.agentName ??= stringValue(value.name) ?? String(value.agentId);
  } else if (event.type === 'artifact_created') {
    value.artifactId ??= stringValue(value.id) ?? `artifact-${index}`;
    value.artifactPath ??= stringValue(value.path) ?? String(value.artifactId);
  } else if (event.type === 'state_written') {
    value.key ??= 'state';
    value.value ??= value.state;
  } else if (event.type === 'reload') {
    value.preserve ??= [];
  } else if (event.type === 'resize') {
    value.cols ??= 80;
    value.rows ??= 24;
  } else if (event.type === 'theme_changed') {
    value.theme ??= 'dark';
  } else if (event.type === 'key') {
    value.key ??= '';
  } else if (event.type === 'checkpoint') {
    value.name ??= `checkpoint-${index}`;
  }
  return event;
}

function eventTime(record: Record<string, unknown>, index: number): number {
  const candidate = record.at ?? record.timeMs ?? record.timestamp ?? record.time ?? record.ts;
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) return candidate;
  if (typeof candidate === 'string') {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    const date = Date.parse(candidate);
    if (Number.isFinite(date) && date >= 0) return date;
  }
  return index;
}

async function copyArtifacts(source: string, output: string): Promise<string[]> {
  const destination = join(output, 'artifacts');
  const paths: string[] = [];
  await copyTree(resolve(source), destination, '', paths);
  return paths;
}

async function copyTree(source: string, destination: string, prefix: string, paths: string[]): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error(`Artifact symlinks are not supported: ${join(source, entry.name)}`);
    const rel = safeRelativePath(join(prefix, entry.name));
    const sourcePath = join(source, rel);
    const destinationPath = join(destination, rel);
    if (entry.isDirectory()) {
      await mkdir(destinationPath, { recursive: true });
      await copyTree(source, destination, rel, paths);
    } else if (entry.isFile()) {
      await mkdir(dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, await readFile(sourcePath));
      paths.push(`artifacts/${rel}`);
    }
  }
}

function safeRelativePath(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) throw new Error(`Unsafe relative path: ${path}`);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part === '.')) throw new Error(`Unsafe relative path: ${path}`);
  return parts.join('/');
}

function sanitizeEventPaths(events: FixtureEvent[]): FixtureEvent[] {
  return events.map((event) => {
    const copy = { ...event } as Record<string, unknown>;
    if (typeof copy.artifactPath === 'string') copy.artifactPath = portablePath(copy.artifactPath, 'artifacts');
    if (typeof copy.sessionDir === 'string') copy.sessionDir = portablePath(copy.sessionDir, 'session');
    return copy as unknown as FixtureEvent;
  });
}

function portablePath(value: string, prefix: string): string {
  const normalized = value.replaceAll('\\', '/');
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  const safeParts = parts.filter((part) => part !== '..' && !part.includes(':'));
  const leaf = safeParts.at(-1) ?? 'source';
  if (prefix === 'artifacts' && normalized.startsWith('artifacts/')) return safeParts.join('/');
  return `${prefix}/${leaf}`;
}

function buildFixture(options: FixtureImportOptions, events: FixtureEvent[]): Fixture {
  const redacted = sanitizeEventPaths(redactEvents(sortEvents(events), options));
  const fixture: Fixture = {
    version: 1,
    name: options.name ?? basename(resolve(options.output)),
    description: options.description ?? 'Imported fixture',
    viewport: options.viewport ?? { cols: 80, rows: 24 },
    theme: options.theme ?? 'dark',
    pollIntervalMs: options.pollIntervalMs ?? 1000,
    timeline: redacted,
  };
  const result = validateFixture(fixture);
  if (!result.valid) throw new Error(`Generated fixture failed validation: ${result.errors?.join(', ')}`);
  return fixture;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseError(path: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Invalid JSON in ${path}: ${message}`);
}
