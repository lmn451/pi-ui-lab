import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runPty, type PtyRunResult } from './node-pty-runner.js';

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
  readonly theme?: string;
  readonly timeoutMs?: number;
  readonly externalSut?: ExternalSutPtyOptions;
}

async function existing(path: string): Promise<string> {
  await access(path);
  return path;
}

function piCliPath(cwd: string): string {
  return resolve(cwd, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
}

function piArgs(cwd: string, extension: string): string[] {
  return [
    piCliPath(cwd), '--no-session', '--no-extensions', '--no-tools', '--offline', '--no-context-files',
    '--no-themes', '--no-skills', '--no-prompt-templates', '-e', extension,
  ];
}

/** Run the built Pi extension through a real PTY and issue /ui-lab interactively. */
export async function runPiPty(options: PiPtyRunOptions): Promise<PtyRunResult> {
  const cwd = options.cwd ?? process.cwd();
  if (options.externalSut) return runExternalSutPty(cwd, options);
  const extension = await existing(resolve(cwd, 'dist/pi-extension/index.js'));
  const fixture = resolve(cwd, options.fixture);
  return runPiCommand(cwd, piArgs(cwd, extension), uiLabCommand(fixture, options), options);
}

async function runExternalSutPty(cwd: string, options: PiPtyRunOptions): Promise<PtyRunResult> {
  const sut = validateExternalSut(options.externalSut);
  const sandbox = await createNotificationSandbox();
  const bridge = await existing(resolve(cwd, 'dist/process/external-sut-pty-bridge.js'));
  const env = externalSutEnvironment(cwd, sut);
  try {
    return await runPiCommand(sandbox, piArgs(cwd, bridge), '/ui-lab-sut-notify', options, env);
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
function externalSutEnvironment(cwd: string, sut: ExternalSutPtyOptions): PtyEnvironment {
  return {
    ...process.env, PI_OFFLINE: '1',
    PI_UI_LAB_SUT_EXTENSION: resolve(cwd, sut.extensionPath),
    PI_UI_LAB_SUT_MODULE: resolve(cwd, sut.modulePath),
  };
}

function uiLabCommand(fixture: string, options: PiPtyRunOptions): string {
  return `/ui-lab ${fixture} --cols ${options.cols} --rows ${options.rows}`;
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

async function createNotificationSandbox(): Promise<string> {
  const sandbox = await mkdtemp(join(tmpdir(), 'pi-ui-lab-sut-'));
  const artifact = join(sandbox, '.pi', 'subagentura-artifacts', 'external-notify');
  await mkdir(artifact, { recursive: true });
  await writeFile(join(artifact, 'events.ndjson'), [
    '{"ts":1,"type":"done","status":"done","summary":"completion marker"}',
    '{"ts":2,"type":"error","status":"error","message":"completion marker"}',
    '',
  ].join('\n'));
  await writeFile(join(artifact, 'output.md'), 'completion marker\n');
  await writeFile(join(sandbox, '.pi', 'subagentura-state.json'), JSON.stringify(notificationState(artifact)));
  return sandbox;
}

function notificationState(artifact: string): object {
  return {
    schemaVersion: 2, parent: 'pi-ui-lab', states: {
      'external-notify': {
        id: 'external-notify', paneId: 'pi-ui-lab-external-notify', mux: 'tmux', artifactDir: artifact,
        sessionFile: join(artifact, 'session.jsonl'), parentSessionId: 'pi-ui-lab', name: 'external-notify', notifyOnComplete: 'notify',
      },
    },
  };
}
