import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
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
      args: shellArgs('stty size; sleep 1; stty size'),
      cols: 60,
      rows: 20,
      resizes: [{ atMs: 500, cols: 40, rows: 10 }],
    });
    expect(result.output).toContain('20 60');
    expect(result.output).toContain('10 40');
    expect(result.terminal.cells).toHaveLength(10);
    expect(result.terminal.cells[0]).toHaveLength(40);
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

  it('opens standalone inspect in a PTY and exits on q', async () => {
    if (!(await operational())) return;
    const root = resolve(import.meta.dirname, '../..');
    const result = await runPty({
      executable: process.execPath,
      args: [resolve(root, 'dist/cli/index.js'), 'inspect', resolve(root, 'src/fixtures/sample.json')],
      cols: 80, rows: 24, inputs: [{ atMs: 750, data: 'n' }, { atMs: 1_000, data: 'q' }], timeoutMs: 4_000,
    });
    expect(result.status).toBe('exited');
    expect(result.ansi).toContain('Inspector |');
  }, 6_000);
});

describe('real Pi extension PTY smoke', () => {
  it.each([60, 100])('executes /ui-lab at %d columns', async (cols) => {
    if (!(await operational())) return;
    const { runPiPty } = await import('../process/pi-pty-runner.js');
    const fixture = resolve(import.meta.dirname, '../../fixtures/lifecycle-running.json');
    const result = await runPiPty({ fixture, cols, rows: 24, theme: 'light', cwd: tmpdir() });
    expect(result.output).toContain('Inspector |');
    expect(result.output).toContain('Viewport:');
    expect(result.output).toContain('Theme: light');
  }, 15_000);
});

describe('external production extension PTY conformance', () => {
  const extensionPath = process.env.PI_UI_LAB_SUT_EXTENSION;
  const modulePath = process.env.PI_UI_LAB_SUT_MODULE;
  it.skipIf(!extensionPath || !modulePath).each([60, 100])('renders external notification at %d columns', async (cols) => {
    if (!(await operational())) return;
    const { runPiPty } = await import('../process/pi-pty-runner.js');
    const result = await runPiPty({
      fixture: 'fixtures/external/completion-notification.json', cols, rows: 24,
      externalSut: { extensionPath: extensionPath!, modulePath: modulePath! },
    });
    expect(result.output).toContain('external-notify');
    expect(result.output).toContain('Sub-agent external-notify (done)');
    expect(result.output).toContain('completion marker');
  }, 15_000);
});
