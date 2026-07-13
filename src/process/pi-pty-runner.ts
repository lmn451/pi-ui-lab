import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { runPty, type PtyRunResult } from './node-pty-runner.js';

export interface PiPtyRunOptions {
  readonly fixture: string;
  readonly cols: number;
  readonly rows: number;
  readonly cwd?: string;
  readonly theme?: string;
  readonly timeoutMs?: number;
}

async function existing(path: string): Promise<string> {
  await access(path);
  return path;
}

function piCliPath(cwd: string): string {
  return resolve(cwd, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
}

/** Run the built Pi extension through a real PTY and issue /ui-lab interactively. */
export async function runPiPty(options: PiPtyRunOptions): Promise<PtyRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const extension = await existing(resolve(cwd, 'dist/pi-extension/index.js'));
  const fixture = resolve(cwd, options.fixture);
  const args = [
    piCliPath(cwd), '--no-session', '--no-tools', '--offline', '--no-context-files',
    '--no-themes', '--no-skills', '--no-prompt-templates', '-e', extension,
  ];
  const command = `/ui-lab ${fixture} --cols ${options.cols} --rows ${options.rows}`;
  return runPty({
    executable: process.execPath,
    args,
    cols: options.cols,
    rows: options.rows,
    cwd,
    inputs: [
      { atMs: 4_000, data: `${command}\r` },
      { atMs: 8_000, data: '\u0004' },
    ],
    timeoutMs: options.timeoutMs ?? 11_000,
    env: { ...process.env, PI_OFFLINE: '1' },
  });
}
