// =============================================================================
// Cursor tracker tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { trackCursor } from '../capture/cursor-tracker.js';
import type { CursorState, Viewport } from '../types.js';

const VP: Viewport = { rows: 10, cols: 40 };
const INITIAL: CursorState = { row: 0, col: 0, visible: true };

describe('trackCursor', () => {
  it('handles plain text advancement', () => {
    const result = trackCursor('Hello', INITIAL, VP);
    expect(result.row).toBe(0);
    expect(result.col).toBe(5);
  });

  it('handles CUP (absolute positioning)', () => {
    const result = trackCursor('\x1b[5;10H', INITIAL, VP);
    expect(result.row).toBe(4);
    expect(result.col).toBe(9);
  });

  it('handles CUU (cursor up)', () => {
    const result = trackCursor('\x1b[3BA\x1b[1AA', INITIAL, VP);
    // Down 3→row=3, A→col=1, up 1→row=2, A→col=2
    expect(result.row).toBe(2);
    expect(result.col).toBe(2);
  });

  it('handles CUD (cursor down)', () => {
    const result = trackCursor('\x1b[5B', INITIAL, VP);
    expect(result.row).toBe(5);
  });

  it('handles CUF (cursor forward)', () => {
    const result = trackCursor('\x1b[10C', INITIAL, VP);
    expect(result.col).toBe(10);
  });

  it('handles CUB (cursor back)', () => {
    const result = trackCursor('ABC\x1b[2D', INITIAL, VP);
    expect(result.col).toBe(1);
  });

  it('handles save/restore cursor', () => {
    const result = trackCursor('\x1b[5;10H\x1b[sAB\x1b[uC', INITIAL, VP);
    // Saved at (4,9), wrote "AB" advancing to (4,11), restored to (4,9), wrote "C"
    expect(result.row).toBe(4);
    expect(result.col).toBe(10);
  });

  it('clamps to viewport bounds', () => {
    const result = trackCursor('\x1b[100;100H', INITIAL, VP);
    expect(result.row).toBe(9);
    expect(result.col).toBe(39);
  });

  it('clamps negative positions', () => {
    const result = trackCursor('\x1b[0A', INITIAL, VP);
    expect(result.row).toBe(0);
  });

  it('handles newline', () => {
    const result = trackCursor('A\nB', INITIAL, VP);
    expect(result.row).toBe(1);
    expect(result.col).toBe(1);
  });

  it('handles carriage return', () => {
    const result = trackCursor('ABC\rX', INITIAL, VP);
    expect(result.row).toBe(0);
    expect(result.col).toBe(1);
  });

  it('handles tab', () => {
    const result = trackCursor('\t', INITIAL, VP);
    expect(result.col).toBe(8);
  });

  it('handles backspace', () => {
    const result = trackCursor('AB\b', INITIAL, VP);
    expect(result.col).toBe(1);
  });

  it('preserves initial visible state', () => {
    const result = trackCursor('X', { row: 0, col: 0, visible: false }, VP);
    expect(result.visible).toBe(false);
  });

  it('handles cursor hide/show', () => {
    const result = trackCursor('\x1b[?25l\x1b[?25h', INITIAL, VP);
    expect(result.visible).toBe(true);
  });
});
