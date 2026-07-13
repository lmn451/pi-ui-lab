// =============================================================================
// ANSI parser tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { parseAnsi } from '../capture/ansi-parser.js';
import type { Viewport } from '../types.js';

const VP: Viewport = { rows: 4, cols: 20 };

describe('parseAnsi – plain text', () => {
  it('places text at correct positions', () => {
    const grid = parseAnsi('Hello', VP);
    expect(grid[0][0].char).toBe('H');
    expect(grid[0][1].char).toBe('e');
    expect(grid[0][4].char).toBe('o');
    expect(grid[0][5].char).toBe(' ');
  });

  it('handles newlines', () => {
    const grid = parseAnsi('A\nB\nC', VP);
    expect(grid[0][0].char).toBe('A');
    expect(grid[1][0].char).toBe('B');
    expect(grid[2][0].char).toBe('C');
  });

  it('handles carriage return', () => {
    const grid = parseAnsi('ABC\rX', VP);
    expect(grid[0][0].char).toBe('X');
    expect(grid[0][1].char).toBe('B');
    expect(grid[0][2].char).toBe('C');
  });
});

describe('parseAnsi – styles', () => {
  it('applies bold', () => {
    const grid = parseAnsi('\x1b[1mB', VP);
    expect(grid[0][0].bold).toBe(true);
    // Reset
    const grid2 = parseAnsi('\x1b[1mB\x1b[0mN', VP);
    expect(grid2[0][0].bold).toBe(true);
    expect(grid2[0][1].bold).toBeUndefined();
  });

  it('applies italic', () => {
    const grid = parseAnsi('\x1b[3mI', VP);
    expect(grid[0][0].italic).toBe(true);
  });

  it('applies underline', () => {
    const grid = parseAnsi('\x1b[4mU', VP);
    expect(grid[0][0].underline).toBe(true);
  });

  it('resets all styles', () => {
    const grid = parseAnsi('\x1b[1;3;4mX\x1b[0mY', VP);
    expect(grid[0][0].bold).toBe(true);
    expect(grid[0][0].italic).toBe(true);
    expect(grid[0][0].underline).toBe(true);
    expect(grid[0][1].bold).toBeUndefined();
    expect(grid[0][1].italic).toBeUndefined();
    expect(grid[0][1].underline).toBeUndefined();
  });

  it('resets individual properties', () => {
    const grid = parseAnsi('\x1b[1;3mX\x1b[22mY', VP);
    expect(grid[0][0].bold).toBe(true);
    expect(grid[0][0].italic).toBe(true);
    expect(grid[0][1].bold).toBeUndefined();
    expect(grid[0][1].italic).toBe(true);
  });
});

describe('parseAnsi – colors', () => {
  it('applies 16 foreground colors', () => {
    const grid = parseAnsi('\x1b[31mR', VP);
    expect(grid[0][0].fg).toBe('#AA0000');
  });

  it('applies 16 background colors', () => {
    const grid = parseAnsi('\x1b[44mB', VP);
    expect(grid[0][0].bg).toBe('#0000AA');
  });

  it('applies bright foreground colors', () => {
    const grid = parseAnsi('\x1b[91mR', VP);
    expect(grid[0][0].fg).toBe('#FF5555');
  });

  it('applies 256-color foreground', () => {
    const grid = parseAnsi('\x1b[38;5;196mR', VP);
    // 196 = red in 256-color
    expect(grid[0][0].fg).toBeDefined();
  });

  it('applies 256-color background', () => {
    const grid = parseAnsi('\x1b[48;5;21mB', VP);
    expect(grid[0][0].bg).toBeDefined();
  });

  it('applies true color foreground', () => {
    const grid = parseAnsi('\x1b[38;2;255;128;0mR', VP);
    expect(grid[0][0].fg).toBe('#ff8000');
  });

  it('applies true color background', () => {
    const grid = parseAnsi('\x1b[48;2;0;128;255mB', VP);
    expect(grid[0][0].bg).toBe('#0080ff');
  });

  it('resets color with 39/49', () => {
    const grid = parseAnsi('\x1b[31mR\x1b[39mN', VP);
    expect(grid[0][0].fg).toBe('#AA0000');
    expect(grid[0][1].fg).toBeUndefined();
  });
});

describe('parseAnsi – cursor movement', () => {
  it('handles CUP (cursor position)', () => {
    const grid = parseAnsi('\x1b[3;5HA', VP);
    expect(grid[2][4].char).toBe('A');
  });

  it('handles CUU (cursor up)', () => {
    const grid = parseAnsi('\x1b[2BA\x1b[1AA', VP);
    // Down 2, write A at (2,0)→col=1, up 1, write A at (1,1)→col=2
    expect(grid[2][0].char).toBe('A');
    expect(grid[1][1].char).toBe('A');
  });

  it('handles CUF (cursor forward)', () => {
    const grid = parseAnsi('\x1b[3CA', VP);
    expect(grid[0][3].char).toBe('A');
  });

  it('handles CUB (cursor back)', () => {
    const grid = parseAnsi('ABC\x1b[2Dx', VP);
    expect(grid[0][1].char).toBe('x');
  });
});

describe('parseAnsi – erase', () => {
  it('handles ED mode 0 (clear to end of screen)', () => {
    const grid = parseAnsi('HELLO\x1b[0J', VP);
    expect(grid[0][0].char).toBe('H');
    expect(grid[0][4].char).toBe('O');
    // Cursor was at col=5, ED clears from there
    expect(grid[0][5].char).toBe(' ');
  });

  it('handles ED mode 2 (clear entire screen)', () => {
    const grid = parseAnsi('HELLO\x1b[2J', VP);
    expect(grid[0][0].char).toBe(' ');
  });

  it('handles EL mode 0 (clear to end of line)', () => {
    const grid = parseAnsi('HELLO\x1b[0K', VP);
    expect(grid[0][0].char).toBe('H');
    expect(grid[0][4].char).toBe('O');
    // Cursor was at col=5, EL clears from there
    expect(grid[0][5].char).toBe(' ');
  });

  it('handles EL mode 2 (clear entire line)', () => {
    const grid = parseAnsi('HELLO\x1b[2K', VP);
    expect(grid[0][0].char).toBe(' ');
  });
});

describe('parseAnsi – line wrapping', () => {
  it('wraps at viewport width', () => {
    const grid = parseAnsi('A'.repeat(25), { rows: 2, cols: 10 });
    // First 10 chars on row 0, next 10 on row 1
    expect(grid[0][0].char).toBe('A');
    expect(grid[1][0].char).toBe('A');
  });

  it('wraps with newlines', () => {
    const grid = parseAnsi('LINE1\nLINE2', { rows: 3, cols: 10 });
    expect(grid[0][0].char).toBe('L');
    expect(grid[1][0].char).toBe('L');
  });
});

describe('parseAnsi – scroll', () => {
  it('scrolls when exceeding viewport height', () => {
    const grid = parseAnsi('A\nB\nC\nD\nE', { rows: 3, cols: 10 });
    // After 4 newlines, content scrolls
    // Row 0 should have 'C' (A and B scrolled off)
    expect(grid[0][0].char).toBe('C');
    expect(grid[1][0].char).toBe('D');
    expect(grid[2][0].char).toBe('E');
  });

  it('scrolls on CUD past bottom', () => {
    const grid = parseAnsi('A\x1b[5BA', { rows: 3, cols: 10 });
    // After A, cursor at (0,1). CUD 5 scrolls, ends at (2,1). Second A written there.
    expect(grid[2][1].char).toBe('A');
  });
});

describe('parseAnsi – tab', () => {
  it('advances to next 8-column tab stop', () => {
    const grid = parseAnsi('A\tB', { rows: 1, cols: 20 });
    expect(grid[0][0].char).toBe('A');
    expect(grid[0][8].char).toBe('B');
  });
});

describe('parseAnsi – backspace', () => {
  it('moves cursor back one position', () => {
    const grid = parseAnsi('AB\bC', VP);
    expect(grid[0][0].char).toBe('A');
    expect(grid[0][1].char).toBe('C');
  });
});

describe('parseAnsi – escape sequence skipping', () => {
  it('skips OSC sequences', () => {
    const grid = parseAnsi('\x1b]0;title\x07Hello', VP);
    expect(grid[0][0].char).toBe('H');
  });

  it('skips DCS sequences', () => {
    const grid = parseAnsi('\x1bPdata\x1b\\Hello', VP);
    expect(grid[0][0].char).toBe('H');
  });

  it('skips APC sequences', () => {
    const grid = parseAnsi('\x1b_data\x1b\\Hello', VP);
    expect(grid[0][0].char).toBe('H');
  });
});
