import { access, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runPty, type PtyRunResult } from './node-pty-runner.js';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

type PtyEnvironment = Readonly<Record<string, string | undefined>>;

export interface ExternalSutPtyOptions {
  /** Explicit external extension entry point; never inferred from a dependency. */
  readonly extensionPath: string;
  /** Explicit module exporting the external SUT's test-access boundaries. */
  readonly modulePath: string;
}

export interface PiPtyRunOptions {
  readonly fixture: string;
  readonly cols: number;
  readonly rows: number;
  readonly cwd?: string;
  /** Base directory used to resolve external SUT paths. */
  readonly sutCwd?: string;
  readonly theme?: string;
  readonly timeoutMs?: number;
  readonly externalSut?: ExternalSutPtyOptions;
}

async function existing(path: string): Promise<string> {
  await access(path);
  return path;
}

function piCliPath(): string {
  return resolve(packageRoot, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
}

function piArgs(extension: string): string[] {
  return [
    piCliPath(), '--no-session', '--no-extensions', '--no-tools', '--offline', '--no-context-files',
    '--no-themes', '--no-skills', '--no-prompt-templates', '-e', extension,
  ];
}

/** Run the built Pi extension through a real PTY and issue /ui-lab interactively. */
export async function runPiPty(options: PiPtyRunOptions): Promise<PtyRunResult> {
  const cwd = options.cwd ?? process.cwd();
  if (options.externalSut) return runExternalSutPty(cwd, options);
  const extension = await existing(resolve(packageRoot, 'dist/pi-extension/index.js'));
  const fixture = resolve(cwd, options.fixture);
  return runPiCommand(cwd, piArgs(extension), buildUiLabCommand(fixture, options), options);
}

async function runExternalSutPty(cwd: string, options: PiPtyRunOptions): Promise<PtyRunResult> {
  const sut = validateExternalSut(options.externalSut);
  const sandbox = await mkdtemp(join(tmpdir(), 'pi-ui-lab-sut-'));
  const bridge = await existing(resolve(packageRoot, 'dist/process/external-sut-pty-bridge.js'));
  const sutCwd = options.sutCwd ?? cwd;
  const env = externalSutEnvironment(sutCwd, sut, options.theme);
  const fixture = resolve(cwd, options.fixture);
  try {
    return await runPiCommand(
      sandbox, piArgs(bridge), `/ui-lab-sut-run ${quoteArgument(fixture)}`, options, env,
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

function validateExternalSut(sut: ExternalSutPtyOptions | undefined): ExternalSutPtyOptions {
  if (!sut?.extensionPath.trim() || !sut.modulePath.trim()) {
    throw new Error('External PTY SUT requires explicit extensionPath and modulePath');
  }
  return sut;
}
function externalSutEnvironment(
  cwd: string, sut: ExternalSutPtyOptions, theme: string | undefined,
): PtyEnvironment {
  return {
    ...process.env, PI_OFFLINE: '1',
    PI_UI_LAB_SUT_EXTENSION: resolve(cwd, sut.extensionPath),
    PI_UI_LAB_SUT_MODULE: resolve(cwd, sut.modulePath),
    PI_UI_LAB_THEME: theme,
    COLORFGBG: theme === 'light' ? '0;15' : theme === 'dark' ? '15;0' : process.env.COLORFGBG,
  };
}

export function buildUiLabCommand(fixture: string, options: PiPtyRunOptions): string {
  const theme = options.theme ? ` --theme ${quoteArgument(options.theme)}` : '';
  return `/ui-lab ${quoteArgument(fixture)} --cols ${options.cols} --rows ${options.rows}${theme}`;
}

function quoteArgument(value: string): string {
  return JSON.stringify(value);
}

function runPiCommand(
  cwd: string, args: string[], command: string, options: PiPtyRunOptions,
  env: PtyEnvironment = { ...process.env, PI_OFFLINE: '1' },
): Promise<PtyRunResult> {
  return runPty({
    executable: process.execPath, args, cols: options.cols, rows: options.rows, cwd,
    inputs: [{ atMs: 4_000, data: `${command}\r` }, { atMs: 8_000, data: '\u0004' }],
    timeoutMs: options.timeoutMs ?? 11_000, env,
  });
}
