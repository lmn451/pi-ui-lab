// =============================================================================
// ANSI escape sequence parser → CellGrid
// =============================================================================

import type { Cell, CellGrid, CursorState, Viewport } from '../types.js';
import { assertViewport, createEmptyGrid, setCell } from './cell-grid.js';

const RE_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const RE_ZERO = /[\u{00AD}\u{0300}-\u{036F}\u{0483}-\u{0489}\u{0591}-\u{05BD}\u{05BF}\u{05C1}-\u{05C2}\u{05C4}-\u{05C5}\u{0610}-\u{061A}\u{064B}-\u{065F}\u{0670}\u{06D6}-\u{06DC}\u{06DF}-\u{06E4}\u{06EA}-\u{06ED}\u{200B}-\u{200D}\u{2060}\u{FE00}-\u{FE0F}\u{FE20}-\u{FE2F}]/u;
const RE_WIDE = /[\u{1100}-\u{115F}\u{2329}-\u{232A}\u{2E80}-\u{A4CF}\u{AC00}-\u{D7A3}\u{F900}-\u{FAFF}\u{FE10}-\u{FE19}\u{FE30}-\u{FE6F}\u{FF00}-\u{FF60}\u{FFE0}-\u{FFE6}]/u;

/** Display width for one Unicode code point. */
export function charWidth(char: string): number {
  if (!char) return 0;
  if (RE_ZERO.test(char)) return 0;
  if (RE_WIDE.test(char) || RE_EMOJI.test(char)) return 2;
  return 1;
}

const COLORS: Record<number, string> = {
  0: '#000000', 1: '#AA0000', 2: '#00AA00', 3: '#AA5500',
  4: '#0000AA', 5: '#AA00AA', 6: '#00AAAA', 7: '#AAAAAA',
  8: '#555555', 9: '#FF5555', 10: '#55FF55', 11: '#FFFF55',
  12: '#5555FF', 13: '#FF55FF', 14: '#55FFFF', 15: '#FFFFFF',
};

function color256(index: number): string {
  const value = Math.max(0, Math.min(255, index));
  if (value < 16) return COLORS[value];
  if (value < 232) {
    const cube = value - 16;
    const component = (part: number) => part === 0 ? 0 : 55 + part * 40;
    return `#${[Math.floor(cube / 36), Math.floor(cube / 6) % 6, cube % 6]
      .map((part) => component(part).toString(16).padStart(2, '0')).join('')}`;
  }
  const gray = 8 + (value - 232) * 10;
  const hex = gray.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

function rgb(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value))
    .toString(16).padStart(2, '0')).join('')}`;
}

interface State extends CursorState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fg?: string;
  bg?: string;
  savedRow: number;
  savedCol: number;
  scrollback: number;
  clippedCells: number;
  wrapped: boolean;
}

export interface AnsiParseResult {
  grid: CellGrid;
  cursor: CursorState;
  scrollbackLines: number;
  clippedCells: number;
  wrapped: boolean;
}

function blank(): Cell { return { char: ' ', width: 1 }; }
function clearCell(cell: Cell): void {
  cell.char = ' '; cell.width = 1; delete cell.fg; delete cell.bg;
  delete cell.bold; delete cell.italic; delete cell.underline;
}

function scroll(grid: CellGrid, state: State, count: number): void {
  for (let i = 0; i < count && grid.length > 0; i++) {
    grid.shift();
    grid.push(grid[0] ? grid[0].map(() => blank()) : []);
    state.scrollback++;
  }
}

function clampCursor(state: State, viewport: Viewport): void {
  state.row = Math.max(0, Math.min(Math.max(0, viewport.rows - 1), state.row));
  state.col = Math.max(0, Math.min(Math.max(0, viewport.cols - 1), state.col));
}

function moveRow(grid: CellGrid, state: State, row: number, viewport: Viewport): void {
  if (viewport.rows === 0) return;
  while (row >= viewport.rows) { scroll(grid, state, 1); row--; }
  state.row = Math.max(0, row);
}

function newline(grid: CellGrid, state: State, viewport: Viewport): void {
  state.col = 0;
  moveRow(grid, state, state.row + 1, viewport);
}

function applySgr(params: number[], state: State): void {
  const values = params.length === 0 ? [0] : params;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === 0) { state.bold = false; state.italic = false; state.underline = false; delete state.fg; delete state.bg; }
    else if (value === 1) state.bold = true;
    else if (value === 3) state.italic = true;
    else if (value === 4) state.underline = true;
    else if (value === 22) state.bold = false;
    else if (value === 23) state.italic = false;
    else if (value === 24) state.underline = false;
    else if (value === 39) delete state.fg;
    else if (value === 49) delete state.bg;
    else if (value >= 30 && value <= 37) state.fg = COLORS[value - 30];
    else if (value >= 40 && value <= 47) state.bg = COLORS[value - 40];
    else if (value >= 90 && value <= 97) state.fg = COLORS[value - 90 + 8];
    else if (value >= 100 && value <= 107) state.bg = COLORS[value - 100 + 8];
    else if ((value === 38 || value === 48) && values[i + 1] === 5 && values[i + 2] !== undefined) {
      const color = color256(values[i + 2]);
      if (value === 38) state.fg = color; else state.bg = color;
      i += 2;
    } else if ((value === 38 || value === 48) && values[i + 1] === 2 && values[i + 4] !== undefined) {
      const color = rgb(values[i + 2], values[i + 3], values[i + 4]);
      if (value === 38) state.fg = color; else state.bg = color;
      i += 4;
    }
  }
}

function paramsFor(raw: string): number[] {
  const normalized = raw.replace(/^[?>!]/, '');
  if (!normalized) return [];
  return normalized.split(';').map((part) => {
    const value = Number.parseInt(part.split(':')[0] ?? '', 10);
    return Number.isFinite(value) ? value : 0;
  });
}

function eraseLine(grid: CellGrid, row: number, start: number, end: number): void {
  for (let col = Math.max(0, start); col < Math.min(end, grid[row]?.length ?? 0); col++) {
    const cell = grid[row]?.[col]; if (cell) clearCell(cell);
  }
}

function eraseDisplay(grid: CellGrid, state: State, mode: number): void {
  if (mode === 2 || mode === 3) {
    for (const row of grid) eraseLine(grid, grid.indexOf(row), 0, row.length);
    if (mode === 3) state.scrollback = 0;
    return;
  }
  eraseLine(grid, state.row, state.col, grid[state.row]?.length ?? 0);
  for (let row = state.row + 1; row < grid.length; row++) eraseLine(grid, row, 0, grid[row].length);
}

function executeCsi(grid: CellGrid, state: State, raw: string, final: string, viewport: Viewport): void {
  const params = paramsFor(raw);
  const n = (index = 0) => params[index] || 1;
  if (final === 'm') { applySgr(params, state); return; }
  if (final === 'A') state.row = Math.max(0, state.row - n());
  else if (final === 'B') moveRow(grid, state, state.row + n(), viewport);
  else if (final === 'C') state.col = Math.min(Math.max(0, viewport.cols - 1), state.col + n());
  else if (final === 'D') state.col = Math.max(0, state.col - n());
  else if (final === 'E') { moveRow(grid, state, state.row + n(), viewport); state.col = 0; }
  else if (final === 'F') { state.row = Math.max(0, state.row - n()); state.col = 0; }
  else if (final === 'G' || final === '`') state.col = Math.max(0, Math.min(viewport.cols - 1, n() - 1));
  else if (final === 'd') state.row = Math.max(0, Math.min(viewport.rows - 1, n() - 1));
  else if (final === 'H' || final === 'f') {
    moveRow(grid, state, (params[0] || 1) - 1, viewport);
    state.col = Math.max(0, Math.min(viewport.cols - 1, (params[1] || 1) - 1));
  } else if (final === 'J') eraseDisplay(grid, state, params[0] ?? 0);
  else if (final === 'K') {
    const mode = params[0] ?? 0;
    eraseLine(grid, state.row, mode === 1 || mode === 2 ? 0 : state.col,
      mode === 1 ? state.col + 1 : grid[state.row]?.length ?? 0);
    if (mode === 2) eraseLine(grid, state.row, 0, grid[state.row]?.length ?? 0);
  } else if (final === 's') { state.savedRow = state.row; state.savedCol = state.col; }
  else if (final === 'u') { state.row = state.savedRow; state.col = state.savedCol; }
  else if (final === 'h' || final === 'l') {
    if (raw.startsWith('?') && params[0] === 25) state.visible = final === 'h';
  } else if (final === 'S') scroll(grid, state, n());
  else if (final === 'T') { /* scrolling down is not representable without scrollback */ }
  else if (final === 'X') eraseLine(grid, state.row, state.col, state.col + n());
  else if (final === 'P' || final === '@') {
    const count = n();
    const row = grid[state.row] ?? [];
    if (final === 'P') row.splice(state.col, count, ...Array.from({ length: count }, blank));
    else row.splice(state.col, 0, ...Array.from({ length: count }, blank));
    row.length = viewport.cols;
  }
  clampCursor(state, viewport);
}

function skipString(ansi: string, index: number): number {
  while (index < ansi.length) {
    if (ansi[index] === '\x07') return index + 1;
    if (ansi[index] === '\x1b' && ansi[index + 1] === '\\') return index + 2;
    index++;
  }
  return index;
}

function writePrintable(grid: CellGrid, state: State, char: string, width: number, viewport: Viewport): void {
  if (width === 0) {
    const previous = grid[state.row]?.[Math.max(0, state.col - 1)];
    if (previous && previous.width > 0) previous.char += char;
    return;
  }
  if (viewport.cols === 0 || viewport.rows === 0) { state.clippedCells++; return; }
  if (state.col >= viewport.cols) { state.wrapped = true; newline(grid, state, viewport); }
  if (width === 2 && state.col === viewport.cols - 1) {
    state.clippedCells++; state.wrapped = true; newline(grid, state, viewport);
  }
  const cell: Cell = { char, width, fg: state.fg, bg: state.bg,
    bold: state.bold || undefined, italic: state.italic || undefined,
    underline: state.underline || undefined };
  setCell(grid, state.row, state.col, cell);
  if (width === 2) setCell(grid, state.row, state.col + 1, { char: '', width: 0, fg: state.fg, bg: state.bg });
  state.col += width;
  if (state.col >= viewport.cols) { state.wrapped = true; newline(grid, state, viewport); }
}

/** Parse ANSI output into a fixed-size terminal cell grid. */
export function parseAnsiDetailed(ansi: string, viewport: Viewport): AnsiParseResult {
  assertViewport(viewport);
  const grid = createEmptyGrid(viewport.rows, viewport.cols);
  const state: State = { row: 0, col: 0, visible: true, bold: false, italic: false,
    underline: false, savedRow: 0, savedCol: 0, scrollback: 0, clippedCells: 0, wrapped: false };
  let index = 0;
  while (index < ansi.length) {
    const char = ansi[index];
    if (char === '\x1b') {
      const next = ansi[index + 1];
      if (next === '[') {
        let cursor = index + 2;
        while (cursor < ansi.length && ansi.charCodeAt(cursor) >= 0x30 && ansi.charCodeAt(cursor) <= 0x3f) cursor++;
        const raw = ansi.slice(index + 2, cursor);
        while (cursor < ansi.length && ansi.charCodeAt(cursor) >= 0x20 && ansi.charCodeAt(cursor) <= 0x2f) cursor++;
        if (cursor < ansi.length) executeCsi(grid, state, raw, ansi[cursor], viewport);
        index = Math.min(ansi.length, cursor + 1);
      } else if (next === ']' || next === 'P' || next === '_' || next === '^' || next === 'X') {
        index = skipString(ansi, index + 2);
      } else if (next === '7') { state.savedRow = state.row; state.savedCol = state.col; index += 2;
      } else if (next === '8') { state.row = state.savedRow; state.col = state.savedCol; index += 2;
      } else { index += Math.min(2, ansi.length - index); }
    } else if (char === '\r') { state.col = 0; index++; }
    else if (char === '\n') { newline(grid, state, viewport); index++; }
    else if (char === '\t') {
      const nextTab = Math.min(viewport.cols, (Math.floor(state.col / 8) + 1) * 8);
      if (nextTab >= viewport.cols) { state.col = viewport.cols; state.wrapped = true; }
      else state.col = nextTab;
      index++;
    } else if (char === '\b') { state.col = Math.max(0, state.col - 1); index++; }
    else if (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f) index++;
    else {
      const codePoint = ansi.codePointAt(index) ?? 0;
      const printable = String.fromCodePoint(codePoint);
      writePrintable(grid, state, printable, charWidth(printable), viewport);
      index += printable.length;
    }
  }
  return { grid, cursor: { row: state.row, col: state.col, visible: state.visible },
    scrollbackLines: state.scrollback, clippedCells: state.clippedCells, wrapped: state.wrapped };
}

export function parseAnsi(ansi: string, viewport: Viewport): CellGrid {
  return parseAnsiDetailed(ansi, viewport).grid;
}
