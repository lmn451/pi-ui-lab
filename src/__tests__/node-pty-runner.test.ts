import { describe, expect, it } from 'vitest';
import { getPtyBackendStatusAsync, runPty } from '../process/index.js';

const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
const shellArgs = (script: string) => process.platform === 'win32' ? ['/d', '/s', '/c', script] : ['-c', script];

async function operational(): Promise<boolean> {
  return (await getPtyBackendStatusAsync()).available;
}

describe('real node-pty runner', () => {
  it('captures shell output through a PTY', async () => {
    if (!(await operational())) return;
    const result = await runPty({ executable: shell, args: shellArgs('printf PTY_OK'), cols: 60, rows: 20 });
    expect(result.status).toBe('exited');
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('PTY_OK');
  });

  it('passes initial dimensions and applies resize actions', async () => {
    if (!(await operational())) return;
    const result = await runPty({
      executable: shell,
      args: shellArgs('stty size; sleep .1; stty size'),
      cols: 60,
      rows: 20,
      resizes: [{ atMs: 30, cols: 40, rows: 10 }],
    });
    expect(result.output).toContain('20 60');
    expect(result.output).toContain('10 40');
  });

  it('cleans up a process on timeout', async () => {
    if (!(await operational())) return;
    const result = await runPty({ executable: shell, args: shellArgs('sleep 10'), cols: 60, rows: 20, timeoutMs: 100 });
    expect(result.status).toBe('timed-out');
    expect(result.durationMs).toBeLessThan(1_000);
  });

  it('cleans up a process on abort', async () => {
    if (!(await operational())) return;
    const controller = new AbortController();
    const promise = runPty({ executable: shell, args: shellArgs('sleep 10'), cols: 60, rows: 20, signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    const result = await promise;
    expect(result.status).toBe('aborted');
  });
});

describe('real Pi extension PTY smoke', () => {
  it.each([60, 100])('executes /ui-lab at %d columns', async (cols) => {
    if (!(await operational())) return;
    const { runPiPty } = await import('../process/pi-pty-runner.js');
    const result = await runPiPty({ fixture: 'fixtures/lifecycle-running.json', cols, rows: 24 });
    expect(result.output).toContain('ui-lab inspected');
    expect(result.output).toContain('Frames:');
  }, 15_000);
});
