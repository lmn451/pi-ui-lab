// =============================================================================
// Overflow detector tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { detectOverflow } from '../capture/overflow-detector.js';
import { createEmptyGrid, setCell } from '../capture/cell-grid.js';
import type { Viewport } from '../types.js';

describe('detectOverflow', () => {
  it('reports no overflow when content fits', () => {
    const grid = createEmptyGrid(3, 10);
    const report = detectOverflow(grid, { rows: 3, cols: 10 });
    expect(report.horizontal).toBe(false);
    expect(report.vertical).toBe(false);
    expect(report.clippedCells).toBe(0);
    expect(report.scrollbackLines).toBe(0);
    expect(report.unexpectedWrap).toBe(false);
  });

  it('detects horizontal overflow', () => {
    const grid = createEmptyGrid(2, 5);
    // Add a cell beyond viewport width
    grid[0].push({ char: 'X', width: 1 });
    const report = detectOverflow(grid, { rows: 2, cols: 5 });
    expect(report.horizontal).toBe(true);
    expect(report.clippedCells).toBe(1);
  });

  it('detects vertical overflow', () => {
    const grid = createEmptyGrid(5, 5);
    const report = detectOverflow(grid, { rows: 3, cols: 5 });
    expect(report.vertical).toBe(true);
    expect(report.scrollbackLines).toBe(2);
  });

  it('detects both overflows', () => {
    const grid = createEmptyGrid(5, 5);
    grid[0].push({ char: 'X', width: 1 });
    const report = detectOverflow(grid, { rows: 3, cols: 5 });
    expect(report.horizontal).toBe(true);
    expect(report.vertical).toBe(true);
    expect(report.clippedCells).toBe(1);
    expect(report.scrollbackLines).toBe(2);
  });

  it('counts multiple clipped cells', () => {
    const grid = createEmptyGrid(1, 5);
    grid[0].push({ char: 'A', width: 1 });
    grid[0].push({ char: 'B', width: 1 });
    grid[0].push({ char: 'C', width: 1 });
    const report = detectOverflow(grid, { rows: 1, cols: 5 });
    expect(report.clippedCells).toBe(3);
  });

  it('counts scrollback lines correctly', () => {
    const grid = createEmptyGrid(10, 5);
    const report = detectOverflow(grid, { rows: 3, cols: 5 });
    expect(report.scrollbackLines).toBe(7);
  });
});
