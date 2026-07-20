// =============================================================================
// Terminal capture composition helpers
// =============================================================================

import type { CursorState, TerminalState, Viewport } from '../types.js';
import { parseAnsiDetailed } from './ansi-parser.js';
import { detectOverflow } from './overflow-detector.js';
import { extractText } from './text-extractor.js';

const DEFAULT_CURSOR: CursorState = { row: 0, col: 0, visible: true };

/** Capture ANSI into the representations used by ReplayFrame. */
export function captureTerminal(ansi: string, viewport: Viewport, initialCursor = DEFAULT_CURSOR): TerminalState {
  const parsed = parseAnsiDetailed(ansi, viewport, initialCursor);
  const overflow = detectOverflow(parsed.grid, viewport);
  overflow.clippedCells += parsed.clippedCells;
  overflow.wideCharClips += parsed.clippedCells;
  overflow.horizontal ||= parsed.clippedCells > 0;
  overflow.scrollbackLines += parsed.scrollbackLines;
  overflow.vertical ||= parsed.scrollbackLines > 0;
  overflow.unexpectedWrap = parsed.wrapped;
  return { ansi, text: extractText(ansi), cells: parsed.grid, cursor: parsed.cursor, overflow };
}

/** Re-capture the same output at a new viewport without stale grid dimensions. */
export function resizeCapture(ansi: string, viewport: Viewport, initialCursor = DEFAULT_CURSOR): TerminalState {
  return captureTerminal(ansi, viewport, initialCursor);
}

export const captureAnsi = captureTerminal;
