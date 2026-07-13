// =============================================================================
// Terminal structure assertions operating on TerminalState
// =============================================================================

import type { TerminalState, Viewport, CellGrid } from '../types.js';
import type { AssertionResult } from './types.js';
import { pass, fail } from './types.js';

/**
 * Assert that the terminal has no horizontal overflow.
 */
export function toHaveNoHorizontalOverflow(terminal: TerminalState): AssertionResult {
  const { overflow } = terminal;
  if (!overflow.horizontal) {
    return pass('No horizontal overflow');
  }
  return fail(
    `Horizontal overflow detected (${overflow.clippedCells} cells clipped)`,
    overflow.horizontal,
    false,
  );
}

/**
 * Assert that the terminal has no vertical collision (overlapping regions).
 */
export function toHaveNoVerticalCollision(
  terminal: TerminalState,
  viewport: Viewport,
): AssertionResult {
  const { overflow } = terminal;
  if (!overflow.vertical) {
    return pass('No vertical collision');
  }
  return fail(
    `Vertical collision detected`,
    overflow.vertical,
    false,
  );
}

/**
 * Assert that the terminal content fits within the given viewport.
 */
export function toFitViewport(
  terminal: TerminalState,
  viewport: Viewport,
): AssertionResult {
  const { cells } = terminal;
  const rowsOk = cells.length <= viewport.rows;
  const colsOk = cells.every(row => row.length <= viewport.cols);
  if (rowsOk && colsOk) {
    return pass('Terminal fits within viewport');
  }
  const issues: string[] = [];
  if (!rowsOk) issues.push(`rows: ${cells.length} > ${viewport.rows}`);
  if (!colsOk) issues.push('some rows exceed viewport cols');
  return fail(
    `Terminal does not fit viewport: ${issues.join(', ')}`,
    { rows: cells.length, cols: Math.max(...cells.map(r => r.length)) },
    { rows: viewport.rows, cols: viewport.cols },
  );
}

/**
 * Assert that the terminal contains the given text (scan cells row by row).
 */
export function toHaveVisibleText(
  terminal: TerminalState,
  text: string,
): AssertionResult {
  if (terminal.text.includes(text)) {
    return pass(`Terminal contains text "${text}"`);
  }
  return fail(
    `Terminal does not contain text "${text}"`,
    terminal.text,
    text,
  );
}

/**
 * Assert that no two rows in the terminal have identical non-empty content.
 */
export function toHaveDistinctRegions(terminal: TerminalState): AssertionResult {
  const nonEmpty = terminal.cells
    .filter(row => row.some(c => c.char !== ' '))
    .map(row => row.map(c => c.char).join(''));
  const unique = new Set(nonEmpty);
  if (unique.size === nonEmpty.length) {
    return pass('All rows are distinct');
  }
  return fail(
    `Found ${nonEmpty.length - unique.size} duplicate rows`,
    nonEmpty.length,
    unique.size,
  );
}

/**
 * Assert that the cursor position is within the viewport bounds.
 */
export function toHaveValidCursor(
  terminal: TerminalState,
  viewport: Viewport,
): AssertionResult {
  const { cursor } = terminal;
  if (!cursor.visible) {
    return pass('Cursor is hidden (valid)');
  }
  const rowOk = cursor.row >= 0 && cursor.row < viewport.rows;
  const colOk = cursor.col >= 0 && cursor.col < viewport.cols;
  if (rowOk && colOk) {
    return pass(`Cursor at (${cursor.row}, ${cursor.col}) is valid`);
  }
  return fail(
    `Cursor at (${cursor.row}, ${cursor.col}) is out of bounds`,
    { row: cursor.row, col: cursor.col },
    { maxRow: viewport.rows - 1, maxCol: viewport.cols - 1 },
  );
}

/**
 * Assert that the terminal has no unexpected scrollback lines beyond maxScrollback.
 */
export function toHaveNoUnexpectedScrollback(
  terminal: TerminalState,
  maxScrollback: number = 0,
): AssertionResult {
  const scrollback = terminal.overflow.scrollbackLines;
  if (scrollback <= maxScrollback) {
    return pass(`Scrollback ${scrollback} is within limit ${maxScrollback}`);
  }
  return fail(
    `Unexpected scrollback: ${scrollback} > ${maxScrollback}`,
    scrollback,
    maxScrollback,
  );
}
