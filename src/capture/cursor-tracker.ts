// =============================================================================
// Track cursor state through ANSI sequences
// =============================================================================

import type { CursorState, Viewport } from '../types.js';
import { assertViewport } from './cell-grid.js';
import { charWidth } from './ansi-parser.js';

function params(raw: string): number[] {
  const value = raw.replace(/^[?>!]/, '');
  if (!value) return [];
  return value.split(';').map((part) => Number.parseInt(part.split(':')[0] ?? '', 10) || 0);
}

function clamp(row: number, col: number, viewport: Viewport): [number, number] {
  return [Math.max(0, Math.min(viewport.rows - 1, row)),
    Math.max(0, Math.min(viewport.cols - 1, col))];
}

/** Track final cursor position, including Unicode width and private cursor mode. */
export function trackCursor(ansi: string, initial: CursorState, viewport: Viewport): CursorState {
  assertViewport(viewport);
  if (viewport.rows === 0 || viewport.cols === 0) return { row: 0, col: 0, visible: initial.visible };
  let row = Math.max(0, Math.min(viewport.rows - 1, initial.row));
  let col = Math.max(0, Math.min(viewport.cols - 1, initial.col));
  let savedRow = row;
  let savedCol = col;
  let visible = initial.visible;
  let index = 0;
  const advance = (width: number): void => {
    col += width;
    if (col >= viewport.cols) { col = 0; row = Math.min(viewport.rows - 1, row + 1); }
  };
  while (index < ansi.length) {
    const char = ansi[index];
    if (char === '\x1b') {
      const next = ansi[index + 1];
      if (next === '[') {
        let end = index + 2;
        while (end < ansi.length && ansi.charCodeAt(end) >= 0x30 && ansi.charCodeAt(end) <= 0x3f) end++;
        const raw = ansi.slice(index + 2, end);
        while (end < ansi.length && ansi.charCodeAt(end) >= 0x20 && ansi.charCodeAt(end) <= 0x2f) end++;
        const final = ansi[end];
        const values = params(raw);
        const n = values[0] || 1;
        if (final === 'A') row = Math.max(0, row - n);
        else if (final === 'B') row = Math.min(viewport.rows - 1, row + n);
        else if (final === 'C' || final === 'a') col = Math.min(viewport.cols - 1, col + n);
        else if (final === 'D') col = Math.max(0, col - n);
        else if (final === 'E') { row = Math.min(viewport.rows - 1, row + n); col = 0; }
        else if (final === 'F') { row = Math.max(0, row - n); col = 0; }
        else if (final === 'G' || final === '`') col = Math.max(0, Math.min(viewport.cols - 1, n - 1));
        else if (final === 'd') row = Math.max(0, Math.min(viewport.rows - 1, n - 1));
        else if (final === 'H' || final === 'f') [row, col] = clamp((values[0] || 1) - 1, (values[1] || 1) - 1, viewport);
        else if (final === 's') { savedRow = row; savedCol = col; }
        else if (final === 'u') { row = savedRow; col = savedCol; }
        else if ((final === 'h' || final === 'l') && raw.startsWith('?') && values[0] === 25) visible = final === 'h';
        index = Math.min(ansi.length, end + 1);
      } else if (next === ']' || next === 'P' || next === '_' || next === '^' || next === 'X') {
        index += 2;
        while (index < ansi.length && ansi[index] !== '\x07' && !(ansi[index] === '\x1b' && ansi[index + 1] === '\\')) index++;
        if (ansi[index] === '\x07') index++;
        else if (ansi[index] === '\x1b') index += 2;
      } else if (next === '7') { savedRow = row; savedCol = col; index += 2;
      } else if (next === '8') { row = savedRow; col = savedCol; index += 2;
      } else index += Math.min(2, ansi.length - index);
    } else if (char === '\r') { col = 0; index++;
    } else if (char === '\n') { row = Math.min(viewport.rows - 1, row + 1); col = 0; index++;
    } else if (char === '\t') { col = Math.min(viewport.cols - 1, (Math.floor(col / 8) + 1) * 8); index++;
    } else if (char === '\b') { col = Math.max(0, col - 1); index++;
    } else if (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f) index++;
    else {
      const codePoint = ansi.codePointAt(index) ?? 0;
      advance(charWidth(String.fromCodePoint(codePoint)));
      index += String.fromCodePoint(codePoint).length;
    }
  }
  return { row, col, visible };
}
