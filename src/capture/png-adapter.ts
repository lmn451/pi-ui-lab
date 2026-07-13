// =============================================================================
// Deterministic dependency-free PNG renderer
// =============================================================================

import { deflateSync } from 'node:zlib';
import type { CellGrid, CursorState } from '../types.js';

export interface PngBackendStatus {
  available: boolean;
  backend: string | null;
  reason?: string;
}

export interface PngOptions {
  cellWidth?: number;
  cellHeight?: number;
  foreground?: string;
  background?: string;
  cursor?: CursorState;
}

/** The built-in encoder is suitable for deterministic synthetic captures. */
export function getPngBackendStatus(): PngBackendStatus {
  return { available: true, backend: 'builtin',
    reason: 'Using the dependency-free built-in PNG encoder for synthetic captures.' };
}

export function isPngAvailable(): boolean {
  return true;
}

export class PngBackendUnavailableError extends Error {
  constructor(reason = 'PNG backend is unavailable') {
    super(reason);
    this.name = 'PngBackendUnavailableError';
  }
}

/** Encode a cell grid as an RGBA PNG without native image dependencies. */
export function generatePng(grid: CellGrid, options: PngOptions = {}): Uint8Array {
  const cellWidth = positive(options.cellWidth ?? 8, 'cellWidth');
  const cellHeight = positive(options.cellHeight ?? 16, 'cellHeight');
  const columns = Math.max(1, ...grid.map((row) => row.length));
  const rows = Math.max(1, grid.length);
  const width = columns * cellWidth;
  const height = rows * cellHeight;
  const pixels = new Uint8Array(height * (width * 4 + 1));
  const background = parseColor(options.background ?? '#000000', [0, 0, 0]);
  const foreground = parseColor(options.foreground ?? '#ffffff', [255, 255, 255]);
  fillPixels(pixels, width, height, background);
  paintCells(pixels, width, cellWidth, cellHeight, grid, foreground);
  paintCursor(pixels, width, cellWidth, cellHeight, options.cursor, foreground);
  return encodePng(width, height, pixels);
}

export const renderPng = generatePng;

function positive(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`Invalid ${name}: ${value}`);
  return value;
}

function parseColor(value: string, fallback: number[]): number[] {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return fallback;
  const hex = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function fillPixels(pixels: Uint8Array, width: number, height: number, color: number[]): void {
  for (let row = 0; row < height; row++) {
    const start = row * (width * 4 + 1) + 1;
    for (let col = 0; col < width; col++) {
      const offset = start + col * 4;
      pixels.set([color[0], color[1], color[2], 255], offset);
    }
  }
}

function paintCells(pixels: Uint8Array, width: number, cellWidth: number, cellHeight: number,
  grid: CellGrid, foreground: number[]): void {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < (grid[row]?.length ?? 0); col++) {
      const cell = grid[row][col];
      const color = parseColor(cell.fg ?? '', foreground);
      if (cell.bg) paintRect(pixels, width, col * cellWidth, row * cellHeight,
        Math.max(1, cell.width) * cellWidth, cellHeight, parseColor(cell.bg, [0, 0, 0]));
      if (cell.width > 0 && cell.char && cell.char !== ' ') {
        paintGlyph(pixels, width, col * cellWidth, row * cellHeight, cellWidth, cellHeight, cell.char, color);
      }
    }
  }
}

function paintRect(pixels: Uint8Array, width: number, x: number, y: number, w: number, h: number, color: number[]): void {
  const maxX = Math.min(width, x + w);
  const maxY = Math.min((pixels.length / (width * 4 + 1)), y + h);
  for (let row = Math.max(0, y); row < maxY; row++) {
    for (let col = Math.max(0, x); col < maxX; col++) {
      const offset = row * (width * 4 + 1) + 1 + col * 4;
      pixels.set([color[0], color[1], color[2], 255], offset);
    }
  }
}

function paintGlyph(pixels: Uint8Array, width: number, x: number, y: number, cellWidth: number, cellHeight: number, char: string, color: number[]): void {
  const code = char.codePointAt(0) ?? 0;
  const scale = Math.max(1, Math.floor(Math.min(cellWidth / 6, cellHeight / 9)));
  const left = x + Math.max(0, Math.floor((cellWidth - 5 * scale) / 2));
  const top = y + Math.max(0, Math.floor((cellHeight - 7 * scale) / 2));
  for (let glyphY = 0; glyphY < 7; glyphY++) {
    for (let glyphX = 0; glyphX < 5; glyphX++) {
      const bit = (code * 31 + glyphY * 17 + glyphX * 13) % 11 < 5;
      if (bit) paintRect(pixels, width, left + glyphX * scale, top + glyphY * scale, scale, scale, color);
    }
  }
}

function paintCursor(pixels: Uint8Array, width: number, cellWidth: number, cellHeight: number, cursor: CursorState | undefined, color: number[]): void {
  if (!cursor?.visible || cursor.row < 0 || cursor.col < 0) return;
  const x = cursor.col * cellWidth;
  const y = cursor.row * cellHeight;
  paintRect(pixels, width, x, y, cellWidth, 1, color);
  paintRect(pixels, width, x, y + cellHeight - 1, cellWidth, 1, color);
  paintRect(pixels, width, x, y, 1, cellHeight, color);
  paintRect(pixels, width, x + cellWidth - 1, y, 1, cellHeight, color);
}

function encodePng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const chunks = [signature, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', new Uint8Array())];
  return concat(chunks);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat([typeBytes, data]);
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(body, 4);
  view.setUint32(data.length + 8, crc32(body));
  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
