import { pathToFileURL } from 'node:url';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { FixtureLoader } from '../fixtures/fixture-loader.js';
import { createPiSubagenturaAdapter } from '../sut/pi-subagentura-adapter.js';
import type { FixtureEvent } from '../types.js';
import type { SutObservationContext } from '../sut/types.js';

interface ExternalSutModule {
  default?: (pi: ExtensionAPI) => void;
  rehydrateInteractiveSubagents?: (cwd: string) => unknown;
  pollArtifactChanges?: (pi: ExtensionAPI) => unknown;
  interactiveSubagentRegistry?: Map<unknown, unknown>;
}

const extensionPath = requiredEnvironment('PI_UI_LAB_SUT_EXTENSION');
const modulePath = requiredEnvironment('PI_UI_LAB_SUT_MODULE');
const externalExtension = await loadExternal(extensionPath);
const externalModule = await loadExternal(modulePath);

/** Test-only bridge that materializes a fixture and drives an explicit production SUT. */
export default function externalSutPtyBridge(pi: ExtensionAPI): void {
  const activate = externalExtension.default;
  if (typeof activate !== 'function') throw new Error('External SUT extension must have a default export');
  activate(pi);
  pi.registerCommand('ui-lab-sut-run', {
    description: 'Replay a pi-ui-lab fixture through an external SUT',
    handler: async (args: string, context: ExtensionCommandContext) => runFixture(pi, context, args),
  });
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} must name an explicit external SUT path`);
  return value;
}

async function loadExternal(path: string): Promise<ExternalSutModule> {
  return import(/* @vite-ignore */ pathToFileURL(path).href) as Promise<ExternalSutModule>;
}

async function runFixture(pi: ExtensionAPI, context: ExtensionCommandContext, args: string): Promise<void> {
  const fixturePath = parseFixturePath(args);
  const fixture = await new FixtureLoader().load(fixturePath);
  const adapter = createPiSubagenturaAdapter();
  for (const event of fixture.timeline) {
    await withEventTime(event.at, async () => {
      const observation = observationContext(pi, context, fixture, event);
      await adapter.materializeEvent(event, observation);
      await adapter.invokeEvent(event, observation);
      if (shouldPoll(event)) await invokePoll(pi);
    });
  }
}

function observationContext(
  pi: ExtensionAPI,
  commandContext: ExtensionCommandContext,
  fixture: Awaited<ReturnType<FixtureLoader['load']>>,
  event: FixtureEvent,
): SutObservationContext {
  return {
    config: { extensionPath, modulePath, cwd: commandContext.cwd },
    fixture,
    cwd: commandContext.cwd,
    uiCalls: [],
    notificationCalls: [],
    module: externalModule as Record<string, unknown>,
    session: commandContext,
    pi,
    event,
    withVirtualClock: (invoke) => invoke(),
    emitSessionStart: async () => {
      const rehydrate = externalModule.rehydrateInteractiveSubagents;
      if (typeof rehydrate !== 'function') {
        throw new Error('External SUT module must export rehydrateInteractiveSubagents');
      }
      await rehydrate(commandContext.cwd);
    },
  };
}

function shouldPoll(event: FixtureEvent): boolean {
  return event.type !== 'checkpoint' && event.type !== 'resize' && event.type !== 'theme_changed' && event.type !== 'key';
}

async function invokePoll(pi: ExtensionAPI): Promise<void> {
  const poll = externalModule.pollArtifactChanges;
  if (typeof poll !== 'function') throw new Error('External SUT module must export pollArtifactChanges');
  await poll(pi);
}

async function withEventTime<T>(timeMs: number, invoke: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(Date, 'now');
  Object.defineProperty(Date, 'now', { ...descriptor, value: () => timeMs });
  try {
    return await invoke();
  } finally {
    if (descriptor) Object.defineProperty(Date, 'now', descriptor);
    else Reflect.deleteProperty(Date, 'now');
  }
}

function parseFixturePath(args: string): string {
  const value = args.trim();
  if (!value) throw new Error('ui-lab-sut-run requires a fixture path');
  if (!value.startsWith('"')) return value;
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'string' || !parsed) throw new Error('Invalid ui-lab-sut-run fixture path');
  return parsed;
}
