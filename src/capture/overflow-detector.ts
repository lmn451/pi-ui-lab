// =============================================================================
// Detect overflow and cell collisions in terminal output
// =============================================================================

import type { CellGrid, OverflowReport, Viewport } from '../types.js';

export interface CollisionReport {
  collisions: number;
  collision: boolean;
  wideCharClips: number;
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
  // A fixed cell grid does not retain whether adjacent rows came from explicit
  // newlines or autowrap. captureTerminal fills this from parser state.
  return {
    horizontal: rowOverflows.length > 0,
    vertical: grid.length > viewport.rows,
    clippedCells,
    scrollbackLines: Math.max(0, grid.length - viewport.rows),
    unexpectedWrap: false,
    collisions: collisions.collisions,
    collision: collisions.collision,
    rowOverflows,
    wideCharClips: collisions.wideCharClips,
  };
}
