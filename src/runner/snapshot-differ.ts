// Snapshot differ - compare deterministic replay snapshots
import type { CellGrid, CellSnapshot, ExecutionMode, TextSnapshot } from '../types.js';

export interface SnapshotDifference {
  frameIndex: number;
  type: 'text' | 'cell';
  expected: string;
  actual: string;
  line?: number;
}

export interface SnapshotDiff {
  match: boolean;
  mode: ExecutionMode;
  fixtureName: string;
  width: number;
  theme: string;
  differences: SnapshotDifference[];
}

function cellsToText(cells: CellGrid): string {
  return cells.map((row) => row.map((cell) => cell.char).join('')).join('\n');
}

function cellsToJson(cells: CellGrid): string {
  return cells.map((row) => JSON.stringify(row)).join('\n');
}

function diffLines(expected: string, actual: string) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const differences: Array<{ line: number; expected: string; actual: string }> = [];
  const count = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < count; index++) {
    const left = expectedLines[index];
    const right = actualLines[index];
    if (left !== right) differences.push({
      line: index + 1, expected: left ?? '(missing line)', actual: right ?? '(missing line)',
    });
  }
  return differences;
}

function metadataDiffers(expected: TextSnapshot | CellSnapshot, actual: TextSnapshot | CellSnapshot): boolean {
  const left = expected.metadata;
  const right = actual.metadata;
  return left.fixtureHash !== right.fixtureHash || left.theme !== right.theme
    || left.executionMode !== right.executionMode
    || left.viewport.cols !== right.viewport.cols || left.viewport.rows !== right.viewport.rows;
}

function makeDiff(
  differences: SnapshotDifference[], fixtureName: string, width: number, theme: string, mode: ExecutionMode,
): SnapshotDiff {
  return { match: differences.length === 0, mode, fixtureName, width, theme, differences };
}

export function diffTextSnapshots(
  expected: TextSnapshot, actual: TextSnapshot, fixtureName: string, width: number, theme: string,
 ): SnapshotDiff {
  const differences: SnapshotDifference[] = [];
  if (metadataDiffers(expected, actual)) differences.push({
    frameIndex: -1, type: 'text', expected: JSON.stringify(expected.metadata), actual: JSON.stringify(actual.metadata),
  });
  const count = Math.max(expected.frames.length, actual.frames.length);
  for (let index = 0; index < count; index++) {
    const left = expected.frames[index];
    const right = actual.frames[index];
    if (!left || !right) {
      differences.push({ frameIndex: index, type: 'text', expected: left?.text ?? '(missing frame)', actual: right?.text ?? '(missing frame)' });
      continue;
    }
    if (left.index !== right.index || left.timeMs !== right.timeMs) {
      differences.push({
        frameIndex: index, type: 'text',
        expected: `index=${left.index},timeMs=${left.timeMs}`,
        actual: `index=${right.index},timeMs=${right.timeMs}`,
      });
    }
    for (const line of diffLines(left.text, right.text)) {
      differences.push({ frameIndex: index, type: 'text', ...line });
    }
  }
  return makeDiff(differences, fixtureName, width, theme, actual.metadata.executionMode);
}

export function diffCellSnapshots(
  expected: CellSnapshot, actual: CellSnapshot, fixtureName: string, width: number, theme: string,
 ): SnapshotDiff {
  const differences: SnapshotDifference[] = [];
  if (metadataDiffers(expected, actual)) differences.push({
    frameIndex: -1, type: 'cell', expected: JSON.stringify(expected.metadata), actual: JSON.stringify(actual.metadata),
  });
  const count = Math.max(expected.frames.length, actual.frames.length);
  for (let index = 0; index < count; index++) {
    const left = expected.frames[index];
    const right = actual.frames[index];
    if (!left || !right) {
      differences.push({ frameIndex: index, type: 'cell', expected: left ? cellsToText(left.cells) : '(missing frame)', actual: right ? cellsToText(right.cells) : '(missing frame)' });
      continue;
    }
    if (left.index !== right.index || left.timeMs !== right.timeMs) {
      differences.push({
        frameIndex: index, type: 'cell',
        expected: `index=${left.index},timeMs=${left.timeMs}`,
        actual: `index=${right.index},timeMs=${right.timeMs}`,
      });
    }
    const leftText = cellsToText(left.cells);
    const rightText = cellsToText(right.cells);
    const rowsDiffer = cellsToJson(left.cells) !== cellsToJson(right.cells);
    if (rowsDiffer) {
      const lines = diffLines(rowsDiffer && leftText !== rightText ? leftText : cellsToJson(left.cells), rowsDiffer && leftText !== rightText ? rightText : cellsToJson(right.cells));
      for (const line of lines) differences.push({ frameIndex: index, type: 'cell', ...line });
    }
  }
  return makeDiff(differences, fixtureName, width, theme, actual.metadata.executionMode);
}
