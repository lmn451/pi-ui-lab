import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dirname, '../../dist/cli/index.js');

function run(args: string, { expectExit = 0 } = {}): string {
  try {
    return execSync(`node ${CLI} ${args}`, {
      encoding: 'utf-8',
      timeout: 10_000,
    });
  } catch (err) {
    if (expectExit !== 0) {
      return (err as { stderr: string }).stderr ?? '';
    }
    throw err;
  }
}

describe('CLI', () => {
  it('--help outputs usage', () => {
    const out = run('--help');
    expect(out).toContain('pi-ui-lab');
    expect(out).toContain('Deterministic replay engine');
    expect(out).toContain('replay');
    expect(out).toContain('doctor');
  });

  it('--version outputs version', () => {
    const out = run('--version');
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('unknown command fails', () => {
    const out = run('bogus', { expectExit: 1 });
    expect(out).toContain("unknown command");
  });

  it('doctor runs without crashing', () => {
    const out = run('doctor');
    expect(out).toContain('Node.js');
  });

  it('replay with missing fixture exits with error', () => {
    const out = run('replay nonexistent.json', { expectExit: 2 });
    expect(out).toContain('Failed to load fixture');
  });

  it('replay with valid fixture prints fixture info', () => {
    const fixture = resolve(import.meta.dirname, '../fixtures/sample.json');
    const out = run(`replay ${fixture}`);
    expect(out).toContain('Fixture:');
    expect(out).toContain('Events:');
  });

  it('inspect supports deterministic --non-interactive output', () => {
    const fixture = resolve(import.meta.dirname, '../fixtures/sample.json');
    const out = run(`inspect ${fixture} --non-interactive`);
    expect(out).toContain('Fixture:');
    expect(out).toContain('Inspector');
  });
});
