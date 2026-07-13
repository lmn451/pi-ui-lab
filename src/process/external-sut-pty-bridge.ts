import { pathToFileURL } from 'node:url';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

interface ExternalSutModule {
  default?: (pi: ExtensionAPI) => void;
  rehydrateInteractiveSubagents?: (cwd: string) => unknown;
  pollArtifactChanges?: (pi: ExtensionAPI) => unknown;
}

const extensionPath = requiredEnvironment('PI_UI_LAB_SUT_EXTENSION');
const modulePath = requiredEnvironment('PI_UI_LAB_SUT_MODULE');
const externalExtension = await loadExternal(extensionPath);
const externalModule = await loadExternal(modulePath);

/** Test-only bridge: loads an explicit SUT and invokes its registered notification renderer. */
export default function externalSutPtyBridge(pi: ExtensionAPI): void {
  const activate = externalExtension.default;
  if (typeof activate !== 'function') throw new Error('External SUT extension must have a default export');
  activate(pi);
  pi.registerCommand('ui-lab-sut-notify', {
    description: 'Render an external SUT completion fixture',
    handler: async (_args: string, context: ExtensionCommandContext) => runNotificationFixture(pi, context),
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

function runNotificationFixture(pi: ExtensionAPI, context: ExtensionCommandContext): void {
  const rehydrate = externalModule.rehydrateInteractiveSubagents;
  const poll = externalModule.pollArtifactChanges;
  if (typeof rehydrate !== 'function' || typeof poll !== 'function') {
    throw new Error('External SUT module must export rehydrateInteractiveSubagents and pollArtifactChanges');
  }
  rehydrate(context.cwd);
  poll(pi);
}
