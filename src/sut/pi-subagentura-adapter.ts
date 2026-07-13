import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { FixtureEvent, RecoveryState } from '../types.js';
import type { ExternalFixtureAdapter, SutObservationContext } from './types.js';

interface PersistedEntry {
  id: string;
  paneId: string;
  mux: 'tmux';
  artifactDir: string;
  sessionFile: string;
  parentSessionId: string;
  name?: string;
  task?: string;
  notifyOnComplete?: 'notify' | 'inject';
  lastDeliveredEventTs?: number;
  lastInjectedEventTs?: number;
  lastSnapshotEventTs?: number;
}

interface StateFile { schemaVersion: 2; parent: string; states: Record<string, PersistedEntry> }

/** Optional structural adapter for pi-subagentura's documented test exports. */
export function createPiSubagenturaAdapter(): ExternalFixtureAdapter {
  const artifacts = new Map<string, string>();
  return {
    materializeEvent(event, context) {
      materialize(event, context, artifacts);
    },
    invokeEvent(event, context) {
      const module = context.module;
      if (event.type === 'session_start' || event.type === 'reload' || isArtifactEvent(event)) {
        callExport(module, 'rehydrateInteractiveSubagents', context.cwd);
      }
      if (event.type === 'poll' || event.type === 'reload' || isArtifactEvent(event)) {
        callExport(module, 'pollArtifactChanges', context.pi);
      }
    },
    observe(context) {
      return { ui: emptyUi(), recovery: observeRecovery(context.module, artifacts, context.cwd) };
    }
  };
}

function materialize(event: FixtureEvent, context: SutObservationContext, artifacts: Map<string, string>): void {
  if (event.type === 'artifact_created') {
    const directory = safePath(context.cwd, event.artifactPath);
    mkdirSync(directory, { recursive: true });
    artifacts.set(event.artifactId, directory);
    appendJsonEvent(directory, { ts: event.at, type: 'started', status: 'running' });
    ensureState(context, event.artifactId, directory);
    return;
  }
  if (event.type === 'artifact_updated') {
    const directory = artifacts.get(event.artifactId) ?? defaultArtifact(context.cwd, event.artifactId);
    artifacts.set(event.artifactId, directory);
    mkdirSync(directory, { recursive: true });
    appendJsonEvent(directory, { ts: event.at, type: 'tool_activity', status: 'running', summary: event.name ?? 'activity' });
    ensureState(context, event.artifactId, directory);
    return;
  }
  if (event.type === 'state_written') {
    writeCursor(context, event.key, event.value, artifacts);
    return;
  }
  if (event.type === 'waiting' || event.type === 'done' || event.type === 'failed') {
    const id = event.agentId;
    if (!id) return;
    const directory = artifacts.get(id) ?? defaultArtifact(context.cwd, id);
    artifacts.set(id, directory);
    mkdirSync(directory, { recursive: true });
    if (event.type === 'failed') {
      appendJsonEvent(directory, { ts: event.at, type: 'error', status: 'error', message: event.error ?? 'Task failed' });
      writeFileSync(join(directory, 'output.md'), event.error ?? 'Task failed');
    } else if (event.type === 'done') {
      appendJsonEvent(directory, { ts: event.at, type: 'done', status: 'done', summary: event.content ?? 'Task completed' });
      writeFileSync(join(directory, 'output.md'), event.content ?? 'Task completed');
    } else {
      appendJsonEvent(directory, { ts: event.at, type: 'tool_activity', status: 'running', summary: event.reason ?? 'waiting' });
    }
    ensureState(context, id, directory);
  }
}

function ensureState(context: SutObservationContext, id: string, directory: string): void {
  const file = statePath(context.cwd);
  const state = readState(file);
  state.states[id] ??= {
    id, paneId: `pi-ui-lab-${id}`, mux: 'tmux', artifactDir: directory,
    sessionFile: join(directory, 'session.jsonl'), parentSessionId: 'pi-ui-lab', name: id,
    notifyOnComplete: 'notify',
  };
  writeFileSync(file, JSON.stringify(state, null, 2));
}

function writeCursor(context: SutObservationContext, key: string, value: unknown, artifacts: Map<string, string>): void {
  const match = /^(?:lastDeliveredEventTs:)?(.+)$/.exec(key);
  const id = match?.[1] ?? key;
  const directory = artifacts.get(id) ?? defaultArtifact(context.cwd, id);
  artifacts.set(id, directory);
  ensureState(context, id, directory);
  const file = statePath(context.cwd);
  const state = readState(file);
  const entry = state.states[id];
  if (!entry) return;
  if (typeof value === 'number' && Number.isFinite(value)) entry.lastDeliveredEventTs = value;
  else if (value === null) entry.lastDeliveredEventTs = undefined;
  writeFileSync(file, JSON.stringify(state, null, 2));
}

function observeRecovery(module: Record<string, unknown>, artifacts: Map<string, string>, cwd: string): RecoveryState {
  const cursors: Record<string, string | number | null> = {};
  const processedReceipts: string[] = [];
  const registry = module.interactiveSubagentRegistry;
  if (registry instanceof Map) {
    for (const [id, raw] of registry.entries()) {
      const entry = raw as Record<string, unknown>;
      const cursor = entry.lastDeliveredEventTs;
      if (typeof cursor === 'number') {
        cursors[String(id)] = cursor;
        processedReceipts.push(`${String(id)}:${cursor}`);
      }
    }
  }
  const persisted = readState(statePath(cwd));
  for (const [id, entry] of Object.entries(persisted.states)) {
    if (typeof entry.lastDeliveredEventTs !== 'number') continue;
    cursors[id] ??= entry.lastDeliveredEventTs;
    if (!processedReceipts.includes(`${id}:${entry.lastDeliveredEventTs}`)) processedReceipts.push(`${id}:${entry.lastDeliveredEventTs}`);
  }
  const artifactEvents = [];
  for (const [id, directory] of artifacts) {
    const file = join(directory, 'events.ndjson');
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const event = JSON.parse(line) as { ts?: number; type?: string };
        if (typeof event.ts === 'number' && typeof event.type === 'string') {
          artifactEvents.push({ id, type: event.type, timestamp: event.ts });
        }
      } catch { /* malformed external input is ignored by the production reader */ }
    }
  }
  return { cursors, processedReceipts, artifactEvents };
}

function callExport(module: Record<string, unknown>, name: string, ...args: unknown[]): void {
  const fn = module[name];
  if (typeof fn !== 'function') throw new Error(`External SUT module does not export ${name}`);
  fn(...args);
}

function appendJsonEvent(directory: string, event: Record<string, unknown>): void {
  appendFileSync(join(directory, 'events.ndjson'), `${JSON.stringify(event)}\n`);
}
function statePath(cwd: string): string { return join(cwd, '.pi', 'subagentura-state.json'); }
function readState(file: string): StateFile {
  mkdirSync(join(file, '..'), { recursive: true });
  const empty: StateFile = { schemaVersion: 2, parent: 'pi-ui-lab', states: {} };
  if (!existsSync(file)) return empty;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<StateFile>;
    if (parsed && typeof parsed === 'object' && parsed.states && typeof parsed.states === 'object') {
      return { schemaVersion: 2, parent: typeof parsed.parent === 'string' ? parsed.parent : empty.parent, states: parsed.states };
    }
  } catch { /* malformed external state is replaced by a fresh sandbox state */ }
  return empty;
}
function defaultArtifact(cwd: string, id: string): string { return join(cwd, '.pi', 'subagentura-artifacts', id); }
function safePath(cwd: string, candidate: string): string {
  const target = resolve(cwd, candidate);
  const rel = relative(resolve(cwd), target);
  if (isAbsolute(rel) || rel.startsWith('..')) throw new Error(`Artifact path escapes SUT cwd: ${candidate}`);
  return target;
}
function isArtifactEvent(event: FixtureEvent): boolean {
  return event.type === 'artifact_created' || event.type === 'artifact_updated' || event.type === 'waiting' || event.type === 'done' || event.type === 'failed';
}
function emptyUi() { return { footer: { status: 'stale' as const, activeAgents: 0 }, widgets: [], notifications: [], toolRenders: [] }; }
