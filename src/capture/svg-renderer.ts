// =============================================================================
// Deterministic, dependency-free SVG renderer for CellGrid
// =============================================================================

import type { CellGrid, CursorState } from '../types.js';

export interface SvgOptions {
  cellWidth?: number;
  cellHeight?: number;
  foreground?: string;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
  cursor?: CursorState;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Render a terminal cell grid as stable SVG (no timestamps or platform metadata). */
export function renderSvg(grid: CellGrid, options: SvgOptions = {}): string {
  const cellWidth = options.cellWidth ?? 8;
  const cellHeight = options.cellHeight ?? 16;
  const fontSize = options.fontSize ?? 14;
  const foreground = options.foreground ?? '#ffffff';
  const background = options.background ?? '#000000';
  const width = Math.max(0, ...grid.map((row) => row.length)) * cellWidth;
  const height = grid.length * cellHeight;
  const font = escapeXml(options.fontFamily ?? 'monospace');
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<rect width="${width}" height="${height}" fill="${escapeXml(background)}"/>`,
    `<g font-family="${font}" font-size="${fontSize}" dominant-baseline="text-before-edge">`];
  for (let rowIndex = 0; rowIndex < grid.length; rowIndex++) {
    for (let col = 0; col < (grid[rowIndex]?.length ?? 0); col++) {
      const cell = grid[rowIndex][col];
      if (cell.bg) parts.push(`<rect x="${col * cellWidth}" y="${rowIndex * cellHeight}" width="${cell.width * cellWidth}" height="${cellHeight}" fill="${escapeXml(cell.bg)}"/>`);
      if (cell.width === 0 || !cell.char || cell.char === ' ') continue;
      const styles = `${cell.bold ? 'font-weight:bold;' : ''}${cell.italic ? 'font-style:italic;' : ''}${cell.underline ? 'text-decoration:underline;' : ''}`;
      parts.push(`<text x="${col * cellWidth}" y="${rowIndex * cellHeight}" fill="${escapeXml(cell.fg ?? foreground)}" style="${styles}">${escapeXml(cell.char)}</text>`);
    }
  }
  const cursor = options.cursor;
  if (cursor?.visible && cursor.row >= 0 && cursor.col >= 0) {
    parts.push(`<rect x="${cursor.col * cellWidth}" y="${cursor.row * cellHeight}" width="${cellWidth}" height="${cellHeight}" fill="none" stroke="${escapeXml(foreground)}"/>`);
  }
  parts.push('</g></svg>');
  return parts.join('');
}

export const generateSvg = renderSvg;
export const gridToSvg = renderSvg;
