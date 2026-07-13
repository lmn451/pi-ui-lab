// =============================================================================
// Cell grid utility tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  createEmptyGrid,
  gridToText,
  gridsEqual,
  cloneGrid,
  getCell,
  setCell,
} from '../capture/cell-grid.js';

describe('createEmptyGrid', () => {
  it('creates grid with correct dimensions', () => {
    const grid = createEmptyGrid(3, 5);
    expect(grid.length).toBe(3);
    for (const row of grid) {
      expect(row.length).toBe(5);
    }
  });

  it('fills cells with space characters', () => {
    const grid = createEmptyGrid(2, 3);
    for (const row of grid) {
      for (const cell of row) {
        expect(cell.char).toBe(' ');
        expect(cell.width).toBe(1);
      }
    }
  });

  it('creates independent rows', () => {
    const grid = createEmptyGrid(2, 2);
    grid[0][0].char = 'X';
    expect(grid[1][0].char).toBe(' ');
  });
});

describe('gridToText', () => {
  it('converts grid to text', () => {
    const grid = createEmptyGrid(2, 3);
    grid[0][0].char = 'H';
    grid[0][1].char = 'i';
    grid[1][0].char = '!';
    expect(gridToText(grid)).toBe('Hi\n!');
  });

  it('trims trailing spaces from each line', () => {
    const grid = createEmptyGrid(1, 5);
    grid[0][0].char = 'A';
    grid[0][1].char = 'B';
    expect(gridToText(grid)).toBe('AB');
  });

  it('round-trips with parseAnsi for plain text', () => {
    const text = 'Hello\nWorld';
    // Manually build a grid
    const grid = createEmptyGrid(2, 5);
    for (let c = 0; c < 5; c++) {
      grid[0][c].char = text[c];
      grid[1][c].char = text[6 + c];
    }
    expect(gridToText(grid)).toBe('Hello\nWorld');
  });
});

describe('gridsEqual', () => {
  it('returns true for identical grids', () => {
    const a = createEmptyGrid(2, 2);
    const b = createEmptyGrid(2, 2);
    expect(gridsEqual(a, b)).toBe(true);
  });

  it('returns false for different content', () => {
    const a = createEmptyGrid(2, 2);
    const b = createEmptyGrid(2, 2);
    b[0][0].char = 'X';
    expect(gridsEqual(a, b)).toBe(false);
  });

  it('returns false for different dimensions', () => {
    const a = createEmptyGrid(2, 2);
    const b = createEmptyGrid(3, 2);
    expect(gridsEqual(a, b)).toBe(false);
  });

  it('returns false for different styling', () => {
    const a = createEmptyGrid(1, 1);
    const b = createEmptyGrid(1, 1);
    b[0][0].bold = true;
    expect(gridsEqual(a, b)).toBe(false);
  });
});

describe('cloneGrid', () => {
  it('creates independent copy', () => {
    const original = createEmptyGrid(2, 2);
    original[0][0].char = 'X';
    const copy = cloneGrid(original);
    copy[0][0].char = 'Y';
    expect(original[0][0].char).toBe('X');
    expect(copy[0][0].char).toBe('Y');
  });

  it('preserves styling', () => {
    const original = createEmptyGrid(1, 1);
    original[0][0].bold = true;
    original[0][0].fg = '#FF0000';
    const copy = cloneGrid(original);
    expect(copy[0][0].bold).toBe(true);
    expect(copy[0][0].fg).toBe('#FF0000');
  });
});

describe('getCell', () => {
  it('returns cell at valid position', () => {
    const grid = createEmptyGrid(2, 3);
    grid[1][2].char = 'Z';
    const cell = getCell(grid, 1, 2);
    expect(cell?.char).toBe('Z');
  });

  it('returns null for out-of-bounds row', () => {
    const grid = createEmptyGrid(2, 2);
    expect(getCell(grid, -1, 0)).toBeNull();
    expect(getCell(grid, 5, 0)).toBeNull();
  });

  it('returns null for out-of-bounds col', () => {
    const grid = createEmptyGrid(2, 2);
    expect(getCell(grid, 0, -1)).toBeNull();
    expect(getCell(grid, 0, 5)).toBeNull();
  });
});

describe('setCell', () => {
  it('sets cell at valid position', () => {
    const grid = createEmptyGrid(2, 2);
    setCell(grid, 1, 0, { char: 'A', width: 1, bold: true });
    expect(grid[1][0].char).toBe('A');
    expect(grid[1][0].bold).toBe(true);
  });

  it('does nothing for out-of-bounds', () => {
    const grid = createEmptyGrid(2, 2);
    setCell(grid, -1, 0, { char: 'X', width: 1 });
    setCell(grid, 0, 5, { char: 'Y', width: 1 });
    // Grid should be unchanged
    expect(grid[0][0].char).toBe(' ');
  });
});
