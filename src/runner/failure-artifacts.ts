// Failure artifacts - bundle failure data for CI
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatePng } from '../capture/index.js';
import type { Cell, CellGrid } from '../types.js';
import type { SnapshotDiff } from './snapshot-differ.js';

export interface FailureBundle {
  fixtureName: string;
  width: number;
  theme: string;
  timestamp: string;
  expected: { text?: string; cell?: string };
  actual: { text?: string; cell?: string };
  /** Representative cell grids used to render mismatch PNGs. */
  expectedGrid?: CellGrid;
  actualGrid?: CellGrid;
  diff: SnapshotDiff;
  replayCommand: string;
}

export interface FailureBundleOptions {
  expectedText?: string;
  actualText?: string;
  expectedCell?: string;
  actualCell?: string;
  expectedGrid?: CellGrid;
  actualGrid?: CellGrid;
}

export function createFailureBundle(diff: SnapshotDiff, options: FailureBundleOptions): FailureBundle {
  return {
    fixtureName: diff.fixtureName, width: diff.width, theme: diff.theme,
    timestamp: new Date().toISOString(),
    expected: { text: options.expectedText, cell: options.expectedCell },
    actual: { text: options.actualText, cell: options.actualCell },
    expectedGrid: options.expectedGrid, actualGrid: options.actualGrid,
    diff,
    replayCommand: `pi-ui-lab test ${quote(diff.fixtureName)} --width ${diff.width} --theme ${quote(diff.theme)}`,
  };
}

function quote(value: string): string {
  return /[\s'"\\]/.test(value) ? JSON.stringify(value) : value;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+$/, '_');
}

export function saveFailureBundle(bundle: FailureBundle, outputDir: string): string[] {
  const bundleDir = join(outputDir, `${safeName(bundle.fixtureName)}-${bundle.width}x${safeName(bundle.theme)}`);
  if (!existsSync(bundleDir)) mkdirSync(bundleDir, { recursive: true });
  const savedFiles: string[] = [];
  const writeJson = (name: string, value: unknown) => {
    const path = join(bundleDir, name);
    writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
    savedFiles.push(path);
  };
  writeJson('bundle.json', bundle);
  writeJson('diff.json', bundle.diff);
  savedFiles.push(...savePngArtifacts(bundle, bundleDir));
  if (bundle.expected.text !== undefined) savedFiles.push(writeText(bundleDir, 'expected.txt', bundle.expected.text));
  if (bundle.actual.text !== undefined) savedFiles.push(writeText(bundleDir, 'actual.txt', bundle.actual.text));
  if (bundle.expected.cell !== undefined) savedFiles.push(writeText(bundleDir, 'expected-cell.json', bundle.expected.cell));
  if (bundle.actual.cell !== undefined) savedFiles.push(writeText(bundleDir, 'actual-cell.json', bundle.actual.cell));
  return savedFiles;
}

function writeText(directory: string, name: string, content: string): string {
  const path = join(directory, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

function savePngArtifacts(bundle: FailureBundle, directory: string): string[] {
  if (bundle.expectedGrid === undefined || bundle.actualGrid === undefined) return [];
  const diffGrid = createDiffGrid(bundle.expectedGrid, bundle.actualGrid);
  const images: Array<[string, Uint8Array]> = [
    ['expected.png', generatePng(bundle.expectedGrid)],
    ['actual.png', generatePng(bundle.actualGrid)],
    ['diff.png', generatePng(diffGrid)],
  ];
  return images.map(([name, png]) => {
    const path = join(directory, name);
    writeFileSync(path, png);
    return path;
  });
}

/** Build a common-size image and mark every semantic missing/different cell red. */
function createDiffGrid(expected: CellGrid, actual: CellGrid): CellGrid {
  const rows = Math.max(expected.length, actual.length);
  const columns = Math.max(0, ...expected.map((row) => row.length), ...actual.map((row) => row.length));
  return Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => {
    const expectedCell = expected[row]?.[col];
    const actualCell = actual[row]?.[col];
    const source = actualCell ?? expectedCell ?? blankCell();
    const different = !expectedCell || !actualCell || !cellsEqual(expectedCell, actualCell);
    return different ? { ...source, width: Math.max(1, expectedCell?.width ?? 1, actualCell?.width ?? 1), bg: '#ff0000' } : { ...source };
  }));
}

function cellsEqual(left: Cell, right: Cell): boolean {
  return left.char === right.char && left.width === right.width && left.fg === right.fg && left.bg === right.bg
    && left.bold === right.bold && left.italic === right.italic && left.underline === right.underline;
}

function blankCell(): Cell {
  return { char: ' ', width: 1 };
}
