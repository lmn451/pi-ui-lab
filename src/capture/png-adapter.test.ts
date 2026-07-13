import { describe, expect, it } from 'vitest';
import { createEmptyGrid } from './cell-grid.js';
import { generatePng, getPngBackendStatus } from './png-adapter.js';

function readDimensions(png: Uint8Array): [number, number] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

describe('built-in PNG adapter', () => {
  it('reports a deterministic built-in backend', () => {
    const status = getPngBackendStatus();
    expect(status.available).toBe(true);
    expect(status.backend).toBe('builtin');
  });

  it('writes a valid PNG signature and cell dimensions', () => {
    const grid = createEmptyGrid(2, 3);
    grid[0][0] = { char: 'A', width: 1, fg: '#ff0000' };
    const png = generatePng(grid, { cellWidth: 4, cellHeight: 5 });
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(readDimensions(png)).toEqual([12, 10]);
    expect(generatePng(grid, { cellWidth: 4, cellHeight: 5 })).toEqual(png);
  });
});
