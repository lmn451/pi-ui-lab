// =============================================================================
// Cell-grid utilities for terminal capture
// =============================================================================

import type { Cell, CellGrid, Viewport } from '../types.js';

function validDimension(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && Number.isSafeInteger(value);
}

/** Validate a viewport before allocating or resizing a grid. */
export function assertViewport(viewport: Viewport): void {
  if (!validDimension(viewport.rows) || !validDimension(viewport.cols)) {
    throw new RangeError(`Invalid viewport: ${viewport.rows}x${viewport.cols}`);
  }
}

/** Create a grid with independent, blank cells. */
export function createEmptyGrid(rows: number, cols: number): CellGrid {
  if (!validDimension(rows) || !validDimension(cols)) {
    throw new RangeError(`Invalid grid dimensions: ${rows}x${cols}`);
  }
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (): Cell => ({ char: ' ', width: 1 })),
  );
}

/** Convert a grid to text, omitting wide-character continuation cells. */
export function gridToText(grid: CellGrid): string {
  return grid
    .map((row) => row.map((cell) => cell.width === 0 ? '' : cell.char).join('').trimEnd())
    .join('\n');
}

/** Compare dimensions, content, and all supported cell attributes. */
export function gridsEqual(a: CellGrid, b: CellGrid): boolean {
  if (a.length !== b.length) return false;
  for (let row = 0; row < a.length; row++) {
    if (a[row].length !== b[row].length) return false;
    for (let col = 0; col < a[row].length; col++) {
      const left = a[row][col];
      const right = b[row][col];
      if (left.char !== right.char || left.width !== right.width ||
          left.fg !== right.fg || left.bg !== right.bg ||
          left.bold !== right.bold || left.italic !== right.italic ||
          left.underline !== right.underline) return false;
    }
  }
  return true;
}

/** Deep clone a grid and its cells. */
export function cloneGrid(grid: CellGrid): CellGrid {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

export function getCell(grid: CellGrid, row: number, col: number): Cell | null {
  if (row < 0 || row >= grid.length || col < 0) return null;
  return grid[row]?.[col] ?? null;
}

export function setCell(grid: CellGrid, row: number, col: number, cell: Cell): void {
  if (row < 0 || row >= grid.length || col < 0 || col >= (grid[row]?.length ?? 0)) return;
  grid[row][col] = { ...cell };
}

/** Return a resized copy, preserving the top-left portion of the old grid. */
export function resizeGrid(grid: CellGrid, viewport: Viewport): CellGrid {
  assertViewport(viewport);
  const resized = createEmptyGrid(viewport.rows, viewport.cols);
  const rows = Math.min(viewport.rows, grid.length);
  for (let row = 0; row < rows; row++) {
    const source = grid[row] ?? [];
    const target = resized[row];
    for (let col = 0; col < Math.min(viewport.cols, source.length); col++) {
      target[col] = { ...source[col] };
    }
    // Never expose a dangling continuation cell after a narrow resize.
    for (let col = 0; col < target.length; col++) {
      if (target[col].width === 0 && (col === 0 || target[col - 1].width !== 2)) {
        target[col] = { char: ' ', width: 1 };
      }
      if (target[col].width === 2 && col + 1 >= target.length) {
        target[col] = { char: ' ', width: 1 };
      }
    }
  }
  return resized;
}

/** Alias useful to callers that prefer the terminal terminology. */
export const resizeCellGrid = resizeGrid;

/** Return the dimensions represented by a grid. */
export function gridViewport(grid: CellGrid): Viewport {
  return { rows: grid.length, cols: Math.max(0, ...grid.map((row) => row.length)) };
}

/** Reset a cell to the terminal's blank-cell representation. */
export function clearCell(grid: CellGrid, row: number, col: number): void {
  setCell(grid, row, col, { char: ' ', width: 1 });
}
