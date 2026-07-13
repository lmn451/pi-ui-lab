import { resolve } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionFactory,
} from '@earendil-works/pi-coding-agent';
import {
  createUiLabCommand,
  type UiLabCommandDefinition,
  type UiLabCommandRequest,
  type UiLabInspection,
} from '../pi-adapter/ui-lab-command.js';
import type { ReplayResult } from '../replay/replay-engine.js';
import type { Viewport } from '../types.js';

export interface PiExtensionOptions {
  commandFactory?: () => UiLabCommandDefinition;
}

export type PiCommandRegistrar = Pick<ExtensionAPI, 'registerCommand'>;

/** Register the public ui-lab command on a Pi extension API. */
export function registerUiLabCommand(
  pi: PiCommandRegistrar,
  options: PiExtensionOptions = {},
): void {
  const commandFactory = options.commandFactory ?? createUiLabCommand;
  pi.registerCommand('ui-lab', {
    description: 'Inspect or replay a pi-ui-lab fixture',
    handler: async (args, ctx) => {
      await executeUiLabCommand(args, ctx, commandFactory);
    },
  });
}

/** The extension entrypoint loaded by Pi's `-e/--extension` option. */
const extension: ExtensionFactory = (pi) => {
  registerUiLabCommand(pi);
};

export default extension;

export function parseUiLabArgs(args: string): UiLabCommandRequest {
  const tokens = tokenize(args);
  if (tokens.length === 0 || tokens[0] === undefined) {
    throw new Error('ui-lab requires a fixture path');
  }
  const request: UiLabCommandRequest = { fixturePath: tokens[0] };
  let index = 1;
  while (index < tokens.length) {
    const option = tokens[index++];
    if (option === undefined || !option.startsWith('--')) {
      throw new Error(`Unexpected ui-lab argument: ${option ?? ''}`);
    }
    const value = tokens[index++];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${option} requires a value`);
    }
    applyOption(request, option, value);
  }
  return request;
}

function tokenize(args: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const char of args.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '\\' && quote !== "'") {
      escaped = true;
    } else if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (escaped || quote !== undefined) throw new Error('Unterminated ui-lab argument');
  if (current) tokens.push(current);
  return tokens;
}

function applyOption(
  request: UiLabCommandRequest,
  option: string,
  value: string,
): void {
  if (option === '--action') {
    if (value !== 'inspect' && value !== 'replay') throw new Error(`Invalid ui-lab action: ${value}`);
    request.action = value;
  } else if (option === '--at') {
    request.at = parseNonNegativeNumber(value, '--at');
  } else if (option === '--checkpoint') {
    request.checkpoint = value;
  } else if (option === '--cols') {
    request.viewport = { ...(request.viewport ?? { rows: 24 }), cols: parsePositiveInteger(value, '--cols') };
  } else if (option === '--rows') {
    request.viewport = { ...(request.viewport ?? { cols: 80 }), rows: parsePositiveInteger(value, '--rows') };
  } else if (option === '--theme') {
    request.theme = value;
  } else {
    throw new Error(`Unknown ui-lab option: ${option}`);
  }
}

function parseNonNegativeNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${option} must be a non-negative number`);
  return parsed;
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${option} must be a positive integer`);
  return parsed;
}

async function executeUiLabCommand(
  args: string,
  ctx: ExtensionCommandContext,
  commandFactory: () => UiLabCommandDefinition,
): Promise<void> {
  const request = parseUiLabArgs(args);
  const result = await commandFactory().execute({
    ...request,
    fixturePath: resolve(ctx.cwd, request.fixturePath),
  });
  const lines = formatResult(result);
  ctx.ui.setWidget('pi-ui-lab', lines);
  ctx.ui.notify(lines[0] ?? 'ui-lab completed', 'info');
}

function formatResult(result: UiLabInspection | ReplayResult): string[] {
  if ('frame' in result) {
    return [
      `ui-lab inspected ${result.fixturePath}`,
      `Frames: ${result.result.frames.length}`,
      `Last frame: ${result.frame?.timeMs ?? 'none'}ms`,
    ];
  }
  return [
    'ui-lab replay completed',
    `Frames: ${result.frames.length}`,
    `Checkpoints: ${result.checkpoints.size}`,
  ];
}

export type { Viewport };
