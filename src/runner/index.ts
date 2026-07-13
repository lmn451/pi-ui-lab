// Runner barrel export
export { runMatrix, expandMatrix, DEFAULT_WIDTHS, DEFAULT_THEMES, type MatrixConfig, type MatrixResult, type MatrixResultItem } from './matrix-runner.js';
export { runTests, type TestRunnerOptions, type TestResult } from './test-runner.js';
export { FileSnapshotStore, type SnapshotStore, type SnapshotKind } from './snapshot-store.js';
export { diffTextSnapshots, diffCellSnapshots, type SnapshotDiff, type SnapshotDifference } from './snapshot-differ.js';
export { createFailureBundle, saveFailureBundle, type FailureBundle, type FailureBundleOptions } from './failure-artifacts.js';
export { reportPretty } from './reporters/pretty-reporter.js';
export { reportJson, type JsonReport } from './reporters/json-reporter.js';
export { reportJunit } from './reporters/junit-reporter.js';
