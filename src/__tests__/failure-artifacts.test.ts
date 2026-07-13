import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { createFailureBundle, saveFailureBundle } from '../runner/failure-artifacts.js';
import type { CellGrid } from '../types.js';

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pi-ui-lab-artifacts-'));
  directories.push(directory);
  return directory;
}

function mismatchBundle(expectedGrid: CellGrid, actualGrid: CellGrid) {
  return createFailureBundle({
    match: false, fixtureName: 'visual fixture', width: 2, theme: 'dark',
    differences: [{ frameIndex: 0, type: 'cell', expected: 'A', actual: 'B', line: 1 }],
  }, {
    expectedText: 'A', actualText: 'B', expectedCell: JSON.stringify(expectedGrid),
    actualCell: JSON.stringify(actualGrid), expectedGrid, actualGrid,
  });
}

function pngPixels(png: Uint8Array): Uint8Array {
  let offset = 8;
  const data: Uint8Array[] = [];
  while (offset < png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset).getUint32(0);
    const type = new TextDecoder().decode(png.slice(offset + 4, offset + 8));
    if (type === 'IDAT') data.push(png.slice(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(data));
}

function containsRedPixel(pixels: Uint8Array): boolean {
  for (let offset = 1; offset < pixels.length - 3; offset += 4) {
    if (pixels[offset] === 255 && pixels[offset + 1] === 0 && pixels[offset + 2] === 0) return true;
  }
  return false;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('failure artifacts', () => {
  it('writes deterministic expected, actual, and highlighted diff PNGs for cell mismatches', () => {
    const expected: CellGrid = [[{ char: '界', width: 2 }, { char: '', width: 0 }]];
    const actual: CellGrid = [[{ char: 'A', width: 1 }, { char: ' ', width: 1 }]];
    const bundle = mismatchBundle(expected, actual);
    const first = temporaryDirectory();
    const second = temporaryDirectory();
    const files = saveFailureBundle(bundle, first);
    saveFailureBundle(bundle, second);
    const firstBundle = join(first, 'visual_fixture-2xdark');
    const secondBundle = join(second, 'visual_fixture-2xdark');

    expect(files.map((file) => file.slice(firstBundle.length + 1))).toContain('diff.png');
    for (const name of ['expected.png', 'actual.png', 'diff.png']) {
      const png = readFileSync(join(firstBundle, name));
      expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(png).toEqual(readFileSync(join(secondBundle, name)));
    }
    expect(containsRedPixel(pngPixels(readFileSync(join(firstBundle, 'diff.png'))))).toBe(true);
    expect(readdirSync(firstBundle)).toEqual(expect.arrayContaining([
      'expected-cell.json', 'actual-cell.json', 'diff.json', 'bundle.json',
    ]));
  });

  it('does not write PNGs for text-only failures', () => {
    const directory = temporaryDirectory();
    const bundle = createFailureBundle({
      match: false, fixtureName: 'text fixture', width: 80, theme: 'dark',
      differences: [{ frameIndex: 0, type: 'text', expected: 'old', actual: 'new', line: 1 }],
    }, { expectedText: 'old', actualText: 'new' });
    saveFailureBundle(bundle, directory);

    expect(readdirSync(join(directory, 'text_fixture-80xdark'))).not.toContain('diff.png');
  });
});
