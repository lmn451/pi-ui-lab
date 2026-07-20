import type { IPty } from 'node-pty';
import type { TerminalState } from '../types.js';
import { captureTerminal } from '../capture/terminal-capture.js';

export interface PtyResizeAction {
  readonly atMs: number;
  readonly cols: number;
  readonly rows: number;
}

export interface PtyInputAction {
  readonly atMs: number;
  readonly data: string;
}

export interface PtyRunOptions {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cols: number;
  readonly rows: number;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly input?: string;
  readonly inputs?: readonly PtyInputAction[];
  readonly resizes?: readonly PtyResizeAction[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface PtyRunResult {
  readonly ansi: string;
  readonly output: string;
  readonly terminal: TerminalState;
  readonly exitCode: number | null;
  readonly signal: number | undefined;
  readonly status: 'exited' | 'timed-out' | 'aborted';
  readonly durationMs: number;
}

export class PtyRunnerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PtyRunnerError';
  }
}

function validateOptions(options: PtyRunOptions): void {
  if (!options.executable.trim()) throw new PtyRunnerError('PTY executable must not be empty');
  if (!Array.isArray(options.args) || options.args.some((arg) => typeof arg !== 'string')) {
    throw new PtyRunnerError('PTY args must be an array of strings');
  }
  if (!Number.isInteger(options.cols) || options.cols < 1) throw new PtyRunnerError('PTY cols must be positive');
  if (!Number.isInteger(options.rows) || options.rows < 1) throw new PtyRunnerError('PTY rows must be positive');
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1)) {
    throw new PtyRunnerError('PTY timeoutMs must be positive');
  }
  for (const input of options.inputs ?? []) {
    if (input.atMs < 0 || !Number.isInteger(input.atMs)) throw new PtyRunnerError('PTY input atMs must be non-negative');
  }
  for (const resize of options.resizes ?? []) {
    if (resize.atMs < 0 || !Number.isInteger(resize.atMs)) throw new PtyRunnerError('PTY resize atMs must be non-negative');
    if (resize.cols < 1 || resize.rows < 1 || !Number.isInteger(resize.cols) || !Number.isInteger(resize.rows)) {
      throw new PtyRunnerError('PTY resize dimensions must be positive integers');
    }
  }

}

function killPty(pty: IPty): void {
  try {
    pty.kill();
  } catch {
    // The process may have exited between timeout/abort and cleanup.
  }
}

/** Spawn a real node-pty process. The optional dependency is loaded only when called. */
export async function runPty(options: PtyRunOptions): Promise<PtyRunResult> {
  validateOptions(options);
  const started = Date.now();
  let nodePty: typeof import('node-pty');
  try {
    nodePty = await import('node-pty');
  } catch (error) {
    throw new PtyRunnerError('node-pty is unavailable', { cause: error });
  }

  const pty = nodePty.spawn(options.executable, [...options.args], {
    name: 'xterm-256color', cols: options.cols, rows: options.rows,
    cwd: options.cwd, env: options.env ?? process.env, encoding: 'utf8',
  });
  let ansi = '';
  let status: PtyRunResult['status'] = 'exited';
  let exitCode: number | null = null;
  let exitSignal: number | undefined;
  let currentCols = options.cols;
  let currentRows = options.rows;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const dataDisposable = pty.onData((data) => { ansi += data; });
  const exitPromise = new Promise<void>((resolve) => {
    pty.onExit((event) => {
      exitCode = event.exitCode;
      exitSignal = event.signal;
      resolve();
    });
  });
  const cleanup = () => {
    dataDisposable.dispose();
    for (const timer of timers) clearTimeout(timer);
  };
  const stop = (nextStatus: PtyRunResult['status']) => {
    status = nextStatus;
    killPty(pty);
  };
  if (options.input !== undefined) pty.write(options.input);
  for (const input of options.inputs ?? []) {
    timers.push(setTimeout(() => pty.write(input.data), input.atMs));
  }
  for (const resize of options.resizes ?? []) {
    timers.push(setTimeout(() => {
      pty.resize(resize.cols, resize.rows);
      currentCols = resize.cols;
      currentRows = resize.rows;
    }, resize.atMs));
  }
  const timeout = options.timeoutMs ?? 10_000;
  timers.push(setTimeout(() => stop('timed-out'), timeout));
  const abort = () => stop('aborted');
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const gracePromise = new Promise<void>((resolve) => {
    graceTimer = setTimeout(resolve, timeout + 250);
  });
  await Promise.race([exitPromise, gracePromise]);
  if (graceTimer !== undefined) clearTimeout(graceTimer);
  if (options.signal) options.signal.removeEventListener('abort', abort);
  cleanup();
  const terminal = captureTerminal(ansi, { cols: currentCols, rows: currentRows });
  return {
    ansi, output: terminal.text, terminal, exitCode, signal: exitSignal,
    status, durationMs: Date.now() - started,
  };
}

export const spawnPty = runPty;
