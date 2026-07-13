import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
} from '@earendil-works/pi-coding-agent';
import {
  default as extension,
  parseUiLabArgs,
  registerUiLabCommand,
} from '../pi-extension/index.js';
import type { UiLabInspection } from '../pi-adapter/index.js';
import { InspectorComponent } from '../inspector/index.js';

function captureRegistration(): {
  pi: ExtensionAPI;
  getCommand: () => RegisteredCommand | undefined;
} {
  let command: RegisteredCommand | undefined;
  const pi = {
    registerCommand(name: string, options: Omit<RegisteredCommand, 'name' | 'sourceInfo'>) {
      command = { name, ...options, sourceInfo: {} as RegisteredCommand['sourceInfo'] };
    },
  } as unknown as ExtensionAPI;
  return { pi, getCommand: () => command };
}

function fakeContext(): {
  context: ExtensionCommandContext;
  notify: ReturnType<typeof vi.fn>;
  setWidget: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const setWidget = vi.fn();
  const context = {
    cwd: '/workspace',
    ui: { notify, setWidget } as ExtensionCommandContext['ui'],
  } as unknown as ExtensionCommandContext;
  return { context, notify, setWidget };
}

describe('Pi extension', () => {
  it('registers ui-lab without a slash through the public API', () => {
    const { pi, getCommand } = captureRegistration();
    extension(pi);
    expect(getCommand()?.name).toBe('ui-lab');
  });

  it('parses and validates command arguments without shell evaluation', () => {
    expect(parseUiLabArgs('"fixtures/my file.json" --action replay --at 20 --cols 100'))
      .toEqual({
        fixturePath: 'fixtures/my file.json',
        action: 'replay',
        at: 20,
        viewport: { rows: 24, cols: 100 },
      });
    expect(() => parseUiLabArgs('')).toThrow('requires a fixture path');
    expect(() => parseUiLabArgs('fixture --at -1')).toThrow('non-negative');
    expect(() => parseUiLabArgs('fixture --unknown value')).toThrow('Unknown');
    expect(() => parseUiLabArgs('"unterminated')).toThrow('Unterminated');
  });

  it('resolves against ctx.cwd, delegates, and presents the result through ctx.ui', async () => {
    const { pi, getCommand } = captureRegistration();
    const inspection: UiLabInspection = {
      fixturePath: resolve('/workspace', 'fixtures/sample.json'),
      frame: null,
      result: { frames: [], checkpoints: new Map(), finalState: {} as UiLabInspection['result']['finalState'] },
    };
    const execute = vi.fn(async (request: unknown) => {
      expect(request).toEqual({ fixturePath: inspection.fixturePath });
      return inspection;
    });
    registerUiLabCommand(pi, { commandFactory: () => ({
      name: '/ui-lab', description: 'test', execute,
    }) });
    const command = getCommand();
    const { context, notify, setWidget } = fakeContext();
    await command?.handler('fixtures/sample.json', context);
    expect(execute).toHaveBeenCalledOnce();
    expect(setWidget).toHaveBeenCalledWith('pi-ui-lab', expect.arrayContaining(['Frames: 0']));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('inspected'), 'info');
  });

  it('opens the reusable inspector component through ctx.ui.custom in TUI mode', async () => {
    const { pi, getCommand } = captureRegistration();
    const custom = vi.fn((factory: (tui: unknown, theme: unknown, keys: unknown, done: () => void) => InspectorComponent) => {
      const component = factory({ requestRender: vi.fn() }, {}, {}, vi.fn());
      expect(component).toBeInstanceOf(InspectorComponent);
      component.handleInput('q');
      return Promise.resolve();
    });
    registerUiLabCommand(pi);
    const context = {
      cwd: resolve(import.meta.dirname, '..'),
      mode: 'tui',
      ui: { custom },
    } as unknown as ExtensionCommandContext;
    await getCommand()?.handler('fixtures/sample.json', context);
    expect(custom).toHaveBeenCalledOnce();
  });
});
