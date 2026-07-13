// =============================================================================
// Detect overflow and cell collisions in terminal output
// =============================================================================

import type { CellGrid, OverflowReport, Viewport } from '../types.js';

export interface CollisionReport {
  collisions: number;
  collision: boolean;
  wideCharClips: number;
}

function isVisible(cell: { char: string; width: number }): boolean {
  return cell.width > 0 && cell.char !== ' ';
}

/** Find malformed wide-character continuation cells and overlapping cells. */
export function detectCollisions(grid: CellGrid, viewport: Viewport): CollisionReport {
  let collisions = 0;
  let wideCharClips = 0;
  for (let rowIndex = 0; rowIndex < grid.length; rowIndex++) {
    const row = grid[rowIndex] ?? [];
    for (let col = 0; col < row.length; col++) {
      const cell = row[col];
      if (cell.width > 2 || cell.width < 0) collisions++;
      if (cell.width === 2) {
        if (col + 1 >= viewport.cols) wideCharClips++;
        else if (row[col + 1]?.width !== 0) collisions++;
      } else if (cell.width === 0 && (col === 0 || row[col - 1]?.width !== 2)) {
        collisions++;
      }
    }
  }
  return { collisions, collision: collisions > 0, wideCharClips };
}

/** Analyze a grid against a viewport, including clipping and malformed cells. */
export function detectOverflow(grid: CellGrid, viewport: Viewport): OverflowReport {
  const rowOverflows: number[] = [];
  let clippedCells = 0;
  for (let row = 0; row < grid.length; row++) {
    const width = grid[row]?.length ?? 0;
    if (width > viewport.cols) {
      rowOverflows.push(row);
      clippedCells += width - viewport.cols;
    }
  }
  const collisions = detectCollisions(grid, viewport);
  let unexpectedWrap = false;
  for (let row = 0; row + 1 < Math.min(grid.length, viewport.rows); row++) {
    const current = grid[row] ?? [];
    const next = grid[row + 1] ?? [];
    const last = [...current].reverse().find((cell) => isVisible(cell));
    const first = next.find((cell) => isVisible(cell));
    const currentFilled = current.slice(0, viewport.cols).filter(isVisible).length;
    if (last && first && /[A-Za-z]/u.test(last.char.slice(-1)) &&
        /[a-z]/u.test(first.char[0] ?? '') && currentFilled >= viewport.cols - 2) {
      unexpectedWrap = true;
    }
  }
  return {
    horizontal: rowOverflows.length > 0,
    vertical: grid.length > viewport.rows,
    clippedCells,
    scrollbackLines: Math.max(0, grid.length - viewport.rows),
    unexpectedWrap,
    collisions: collisions.collisions,
    collision: collisions.collision,
    rowOverflows,
    wideCharClips: collisions.wideCharClips,
  };
}
