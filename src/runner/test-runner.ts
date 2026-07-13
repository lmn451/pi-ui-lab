// Test runner - main test execution
import { FileSnapshotStore } from './snapshot-store.js';
import { runMatrix, type MatrixResult } from './matrix-runner.js';
import type { ExternalSutConfig } from '../sut/index.js';

export interface TestRunnerOptions {
  patterns: string[];
  update: boolean;
  matrix: boolean;
  backend: 'in-process' | 'pty';
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
  const widths = options.matrix ? (options.widths ?? []) : [80];
  const themes = options.matrix ? (options.themes ?? []) : ['dark'];
  const snapshotStore = new FileSnapshotStore(options.snapshotDir);
  return runMatrix({
    widths,
    themes,
    fixtures: options.patterns,
    backend: options.backend,
    update: options.update,
    snapshotStore,
    failureDir: options.failureDir,
    shardIndex: options.shardIndex,
    shardCount: options.shardCount,
    sut: options.sut,
  });
}
