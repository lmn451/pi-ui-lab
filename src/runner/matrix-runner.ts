// Matrix runner - deterministic fixture × width × theme execution
import { basename, relative, resolve, sep } from 'node:path';
import { glob } from 'node:fs/promises';
import type { CellGrid, CellSnapshot, ExecutionMode, Fixture, SnapshotMetadata, TextSnapshot } from '../types.js';
import { FixtureLoader } from '../fixtures/index.js';
import { ReplayEngine } from '../replay/replay-engine.js';
import { hashFixture, produceTextSnapshot } from '../replay/snapshot-producer.js';
import { FileSnapshotStore, type SnapshotStore } from './snapshot-store.js';
import { diffCellSnapshots, diffTextSnapshots, type SnapshotDiff } from './snapshot-differ.js';
import { createFailureBundle, saveFailureBundle } from './failure-artifacts.js';
import { PiHarnessSutAdapter } from '../sut/index.js';
import type { ExternalSutConfig } from '../sut/index.js';
import { runPiPty } from '../process/pi-pty-runner.js';

export interface MatrixConfig {
  widths?: number[];
  themes?: string[];
  fixtures: string[];
  mode?: ExecutionMode;
  /** Backward-compatible transport selection. Prefer mode. */
  backend?: 'in-process' | 'pty';
  update?: boolean;
  snapshotStore?: SnapshotStore;
  snapshotDir?: string;
  failureDir?: string;
  shardIndex?: number;
  shardCount?: number;
  /** Explicit production extension/module boundary; absent means synthetic replay. */
  sut?: ExternalSutConfig;
}

export interface MatrixResultItem {
  mode: ExecutionMode;
  fixture: string;
  width: number;
  theme: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  error?: string;
  artifacts?: string[];
}

export interface MatrixResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: MatrixResultItem[];
}

export const DEFAULT_WIDTHS = [60, 80, 100, 120, 160];
export const DEFAULT_THEMES = ['dark', 'light'];
type Combination = { fixture: string; width: number; theme: string };

export function expandMatrix(config: MatrixConfig): Combination[] {
  const widths = config.widths && config.widths.length > 0 ? config.widths : DEFAULT_WIDTHS;
  const themes = config.themes && config.themes.length > 0 ? config.themes : DEFAULT_THEMES;
  const combinations: Combination[] = [];

  for (const fixture of config.fixtures) {
    for (const width of widths) {
      for (const theme of themes) combinations.push({ fixture, width, theme });
    }
  }
  return applySharding(combinations, config.shardIndex, config.shardCount);
}

function applySharding(
  combinations: Combination[],
  shardIndex?: number,
  shardCount?: number,
 ): Combination[] {
  if (shardIndex === undefined && shardCount === undefined) return combinations;
  if (shardCount === undefined || shardCount < 1 || !Number.isInteger(shardCount)) {
    throw new Error('shardCount must be a positive integer');
  }
  if (shardIndex === undefined || !Number.isInteger(shardIndex) || shardIndex < 0) {
    throw new Error('shardIndex must be a non-negative integer');
  }
  return combinations.filter((_, index) => index % shardCount === shardIndex);
}

async function resolveFixtures(patterns: string[]): Promise<string[]> {
  const inputs = patterns.length > 0 ? patterns : ['fixtures/*.json'];
  const paths: string[] = [];
  for (const pattern of inputs) {
    if (!pattern.includes('*') && !pattern.includes('{')) {
      paths.push(resolve(pattern));
      continue;
    }
    for await (const match of glob(pattern)) paths.push(resolve(match));
  }
  return [...new Set(paths)].sort();
}

function createMetadata(
  fixture: Fixture, width: number, theme: string, executionMode: ExecutionMode,
): SnapshotMetadata {
  return {
    fixtureName: fixture.name,
    fixtureHash: hashFixture(JSON.stringify(fixture)),
    platform: process.platform,
    nodeVersion: process.version,
    timestamp: '1970-01-01T00:00:00.000Z',
    viewport: { cols: width, rows: fixture.viewport.rows },
    theme,
    executionMode,
  };
}

interface ReplaySnapshots { text: TextSnapshot; cells?: CellSnapshot }

async function replayFixture(
  fixture: Fixture, width: number, theme: string, mode: Exclude<ExecutionMode, 'pty'>,
  sut?: ExternalSutConfig,
): Promise<ReplaySnapshots> {
  if (mode === 'sut') {
    if (!sut) throw new Error('sut mode requires an external SUT configuration');
    const replay = await new PiHarnessSutAdapter(sut, {
      viewport: { cols: width, rows: fixture.viewport.rows },
      theme,
    }).run(fixture);
    const metadata = createMetadata(fixture, width, theme, mode);
    return { text: produceTextSnapshot(replay.frames, metadata) };
  }
  const engine = new ReplayEngine(fixture, {
    viewport: { cols: width, rows: fixture.viewport.rows },
    theme,
  });
  try {
    const replay = await engine.run();
    const metadata = createMetadata(fixture, width, theme, mode);
    return { text: produceTextSnapshot(replay.frames, metadata) };
  } finally {
    engine.dispose();
  }
}

async function replayFixturePty(
  fixturePath: string, fixture: Fixture, width: number, theme: string, sut: ExternalSutConfig | undefined,
): Promise<ReplaySnapshots> {
  if (!sut) throw new Error('pty mode requires an external SUT configuration');
  const result = await runPiPty({
    fixture: fixturePath, cols: width, rows: fixture.viewport.rows, theme,
    cwd: process.cwd(), sutCwd: sut.cwd,
    externalSut: { extensionPath: sut.extensionPath, modulePath: sut.modulePath },
  });
  if (result.terminal.cells.length === 0) throw new Error('PTY mode produced no terminal cells');
  const metadata = createMetadata(fixture, width, theme, 'pty');
  return {
    text: { frames: [{ index: 0, timeMs: 0, text: result.output }], metadata },
    cells: { frames: [{ index: 0, timeMs: 0, cells: result.terminal.cells }], metadata },
  };
}

function summarizeDiffs(diffs: SnapshotDiff[]): string {
  const differenceCount = diffs.reduce((sum, diff) => sum + diff.differences.length, 0);
  return `${differenceCount} snapshot difference(s) found`;
}

async function runSingleCombination(
  fixturePath: string, width: number, theme: string, config: MatrixConfig,
): Promise<MatrixResultItem> {
  const started = Date.now();
  const fixtureName = basename(fixturePath, '.json');
  const mode = effectiveMode(config);
  const snapshotName = snapshotKey(mode, fixturePath);
  try {
    const fixture = await new FixtureLoader().load(fixturePath);
    const actual = mode === 'pty'
      ? await replayFixturePty(fixturePath, fixture, width, theme, config.sut)
      : await replayFixture(fixture, width, theme, mode, config.sut);
    const store = config.snapshotStore;
    if (!store) return resultItem(mode, fixtureName, width, theme, 'pass', started);
    if (config.update) {
      store.saveTextSnapshot(snapshotName, width, theme, actual.text);
      if (actual.cells) store.saveCellSnapshot(snapshotName, width, theme, actual.cells);
      return resultItem(mode, fixtureName, width, theme, 'pass', started);
    }
    return compareSnapshots(mode, snapshotName, fixtureName, width, theme, actual, store, config, started);
  } catch (error) {
    return {
      mode, fixture: fixtureName, width, theme, status: 'fail', duration: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function resultItem(
  mode: ExecutionMode, fixture: string, width: number, theme: string,
  status: MatrixResultItem['status'], started: number, error?: string,
): MatrixResultItem {
  return { mode, fixture, width, theme, status, duration: Date.now() - started, error };
}

function compareSnapshots(
  mode: ExecutionMode, snapshotName: string, fixture: string, width: number, theme: string,
  actual: ReplaySnapshots, store: SnapshotStore, config: MatrixConfig, started: number,
): MatrixResultItem {
  const expectedText = store.loadTextSnapshot(snapshotName, width, theme);
  const expectedCells = store.loadCellSnapshot(snapshotName, width, theme);
  if (!expectedText) {
    return resultItem(mode, fixture, width, theme, 'fail', started, 'Required text snapshot is missing. Run with --update to create it.');
  }
  if (mode === 'pty' && (!expectedCells || !actual.cells)) {
    return resultItem(mode, fixture, width, theme, 'fail', started, 'PTY mode requires a cell snapshot. Run with --update to create it.');
  }
  const diffs: SnapshotDiff[] = [];
  const textDiff = diffTextSnapshots(expectedText, actual.text, fixture, width, theme);
  if (!textDiff.match) diffs.push(textDiff);
  if (expectedCells && actual.cells) {
    const cellDiff = diffCellSnapshots(expectedCells, actual.cells, fixture, width, theme);
    if (!cellDiff.match) diffs.push(cellDiff);
  }
  if (diffs.length === 0) return resultItem(mode, fixture, width, theme, 'pass', started);
  const artifacts = saveDiffArtifacts(diffs, expectedText, expectedCells, actual, config);
  return { ...resultItem(mode, fixture, width, theme, 'fail', started, summarizeDiffs(diffs)), artifacts };
}

function saveDiffArtifacts(
  diffs: SnapshotDiff[], expectedText: TextSnapshot | null, expectedCells: CellSnapshot | null,
  actual: ReplaySnapshots, config: MatrixConfig,
 ): string[] {
  const files: string[] = [];
  const outputDir = config.failureDir ?? 'failures';
  for (const diff of diffs) {
    const grids = representativeCellGrids(diff, expectedCells, actual.cells);
    const bundle = createFailureBundle(diff, {
      expectedText: expectedText?.frames.map((frame) => frame.text).join('\n'),
      actualText: actual.text.frames.map((frame) => frame.text).join('\n'),
      expectedCell: expectedCells ? JSON.stringify(expectedCells.frames) : undefined,
      actualCell: actual.cells ? JSON.stringify(actual.cells.frames) : undefined,
      expectedGrid: grids?.expectedGrid,
      actualGrid: grids?.actualGrid,
    });
    files.push(...saveFailureBundle(bundle, outputDir));
  }
  return files;
}

/** Select the first differing cell frame; metadata-only diffs use frame zero. */
function representativeCellGrids(
  diff: SnapshotDiff, expected: CellSnapshot | null, actual: CellSnapshot | undefined,
): { expectedGrid: CellGrid; actualGrid: CellGrid } | undefined {
  if (!diff.differences.some((difference) => difference.type === 'cell') || !expected || !actual) return undefined;
  const frameIndex = diff.differences.find((difference) => difference.frameIndex >= 0)?.frameIndex ?? 0;
  return {
    expectedGrid: expected.frames[frameIndex]?.cells ?? [],
    actualGrid: actual.frames[frameIndex]?.cells ?? [],
  };
}


function effectiveMode(config: MatrixConfig): ExecutionMode {
  const inferred = config.backend === 'pty' ? 'pty' : config.sut ? 'sut' : 'model';
  const mode = config.mode ?? inferred;
  if (config.backend && config.backend !== (mode === 'pty' ? 'pty' : 'in-process')) {
    throw new Error(`backend ${config.backend} conflicts with mode ${mode}`);
  }
  if ((mode === 'sut' || mode === 'pty') && !config.sut) {
    throw new Error(`${mode} mode requires an external SUT configuration`);
  }
  return mode;
}

function snapshotKey(mode: ExecutionMode, fixturePath: string): string {
  const portablePath = relative(process.cwd(), fixturePath).split(sep).join('/').replace(/\.json$/u, '');
  return `${mode}/${portablePath}`;
}

export async function runMatrix(config: MatrixConfig): Promise<MatrixResult> {
  effectiveMode(config);
  const snapshotStore = config.update || config.snapshotDir
    ? (config.snapshotStore ?? new FileSnapshotStore(config.snapshotDir))
    : config.snapshotStore;
  const fixturePaths = await resolveFixtures(config.fixtures);
  const combinations = expandMatrix({ ...config, fixtures: fixturePaths });
  const results: MatrixResultItem[] = [];
  for (const combo of combinations) {
    results.push(await runSingleCombination(combo.fixture, combo.width, combo.theme, { ...config, snapshotStore }));
  }
  return summarizeResults(results);
}

function summarizeResults(results: MatrixResultItem[]): MatrixResult {
  return {
    total: results.length,
    passed: results.filter((result) => result.status === 'pass').length,
    failed: results.filter((result) => result.status === 'fail').length,
    skipped: results.filter((result) => result.status === 'skip').length,
    results,
  };
}
