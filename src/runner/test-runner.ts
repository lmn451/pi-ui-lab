// Test runner - main test execution
import { FileSnapshotStore } from './snapshot-store.js';
import { runMatrix, type MatrixResult } from './matrix-runner.js';
import type { ExternalSutConfig } from '../sut/index.js';
import type { ExecutionMode } from '../types.js';

export interface TestRunnerOptions {
  patterns: string[];
  update: boolean;
  matrix: boolean;
  mode: ExecutionMode;
  /** Backward-compatible transport override. Prefer mode. */
  backend?: 'in-process' | 'pty';
  reporter: 'pretty' | 'json' | 'junit';
  widths?: number[];
  themes?: string[];
  shardIndex?: number;
  shardCount?: number;
  snapshotDir?: string;
  failureDir?: string;
  sut?: ExternalSutConfig;
}

export interface TestResult extends MatrixResult {}

export async function runTests(options: TestRunnerOptions): Promise<TestResult> {
  validateMode(options);
  const widths = options.matrix ? (options.widths ?? []) : (options.widths ?? [80]);
  const themes = options.matrix ? (options.themes ?? []) : (options.themes ?? ['dark']);
  const snapshotStore = new FileSnapshotStore(options.snapshotDir);
  return runMatrix({
    widths,
    themes,
    fixtures: options.patterns,
    mode: options.mode,
    backend: options.mode === 'pty' ? 'pty' : 'in-process',
    update: options.update,
    snapshotStore,
    failureDir: options.failureDir,
    shardIndex: options.shardIndex,
    shardCount: options.shardCount,
    sut: options.sut,
  });
}

function validateMode(options: TestRunnerOptions): void {
  if ((options.mode === 'sut' || options.mode === 'pty') && !options.sut) {
    throw new Error(`${options.mode} mode requires --sut-extension and --sut-module`);
  }
  if (options.mode === 'model' && options.sut) {
    throw new Error('model mode does not accept external SUT options');
  }
  if (options.backend && options.backend !== (options.mode === 'pty' ? 'pty' : 'in-process')) {
    throw new Error(`backend ${options.backend} conflicts with mode ${options.mode}`);
  }
}
