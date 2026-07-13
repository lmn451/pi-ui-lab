import { describe, it, expect } from 'vitest';
import {
  toHaveNoHorizontalOverflow,
  toHaveNoVerticalCollision,
  toFitViewport,
  toHaveVisibleText,
  toHaveValidCursor,
  toHaveNoUnexpectedScrollback,
  toHaveDistinctRegions,
} from '../assertions/terminal.js';
import type { TerminalState, Viewport, Cell, CellGrid } from '../types.js';

function makeCell(char = ' ', width = 1): Cell {
  return { char, width };
}

function makeRow(text: string): Cell[] {
  return text.split('').map(ch => makeCell(ch));
}

function makeTerminal(overrides: Partial<TerminalState> = {}): TerminalState {
  return {
    ansi: '',
    text: '',
    cells: [],
    cursor: { row: 0, col: 0, visible: true },
    overflow: { horizontal: false, vertical: false, clippedCells: 0, scrollbackLines: 0, unexpectedWrap: false },
    ...overrides,
  };
}

function makeViewport(cols = 80, rows = 24): Viewport {
  return { cols, rows };
}

// ---------------------------------------------------------------------------
// toHaveNoHorizontalOverflow
// ---------------------------------------------------------------------------
describe('toHaveNoHorizontalOverflow', () => {
  it('passes when no overflow', () => {
    const terminal = makeTerminal();
    const result = toHaveNoHorizontalOverflow(terminal);
    expect(result.pass).toBe(true);
  });

  it('fails when horizontal overflow detected', () => {
    const terminal = makeTerminal({
      overflow: { horizontal: true, vertical: false, clippedCells: 5, scrollbackLines: 0, unexpectedWrap: false },
    });
    const result = toHaveNoHorizontalOverflow(terminal);
    expect(result.pass).toBe(false);
    expect(result.message).toContain('5 cells clipped');
  });
});

// ---------------------------------------------------------------------------
// toHaveNoVerticalCollision
// ---------------------------------------------------------------------------
describe('toHaveNoVerticalCollision', () => {
  it('passes when no collision', () => {
    const terminal = makeTerminal();
    const result = toHaveNoVerticalCollision(terminal, makeViewport());
    expect(result.pass).toBe(true);
  });

  it('fails when vertical collision detected', () => {
    const terminal = makeTerminal({
      overflow: { horizontal: false, vertical: true, clippedCells: 0, scrollbackLines: 0, unexpectedWrap: false },
    });
    const result = toHaveNoVerticalCollision(terminal, makeViewport());
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toFitViewport
// ---------------------------------------------------------------------------
describe('toFitViewport', () => {
  it('passes when terminal fits', () => {
    const terminal = makeTerminal({ cells: [makeRow('hi')] });
    const result = toFitViewport(terminal, makeViewport(10, 5));
    expect(result.pass).toBe(true);
  });

  it('fails when too many rows', () => {
    const terminal = makeTerminal({ cells: [makeRow('a'), makeRow('b'), makeRow('c')] });
    const result = toFitViewport(terminal, makeViewport(10, 2));
    expect(result.pass).toBe(false);
    expect(result.message).toContain('rows');
  });
});

// ---------------------------------------------------------------------------
// toHaveVisibleText
// ---------------------------------------------------------------------------
describe('toHaveVisibleText', () => {
  it('passes when text is present', () => {
    const terminal = makeTerminal({ text: 'Hello world' });
    const result = toHaveVisibleText(terminal, 'Hello');
    expect(result.pass).toBe(true);
  });

  it('fails when text is absent', () => {
    const terminal = makeTerminal({ text: 'Hello world' });
    const result = toHaveVisibleText(terminal, 'xyz');
    expect(result.pass).toBe(false);
    expect(result.message).toContain('does not contain');
  });
});

// ---------------------------------------------------------------------------
// toHaveValidCursor
// ---------------------------------------------------------------------------
describe('toHaveValidCursor', () => {
  it('passes when cursor is in bounds', () => {
    const terminal = makeTerminal({ cursor: { row: 5, col: 10, visible: true } });
    const result = toHaveValidCursor(terminal, makeViewport(80, 24));
    expect(result.pass).toBe(true);
  });

  it('passes when cursor is hidden', () => {
    const terminal = makeTerminal({ cursor: { row: -1, col: -1, visible: false } });
    const result = toHaveValidCursor(terminal, makeViewport(80, 24));
    expect(result.pass).toBe(true);
    expect(result.message).toContain('hidden');
  });

  it('fails when cursor is out of bounds', () => {
    const terminal = makeTerminal({ cursor: { row: 30, col: 100, visible: true } });
    const result = toHaveValidCursor(terminal, makeViewport(80, 24));
    expect(result.pass).toBe(false);
    expect(result.message).toContain('out of bounds');
  });
});

// ---------------------------------------------------------------------------
// toHaveDistinctRegions
// ---------------------------------------------------------------------------
describe('toHaveDistinctRegions', () => {
  it('passes when all rows are distinct', () => {
    const terminal = makeTerminal({
      cells: [makeRow('aaa'), makeRow('bbb'), makeRow('ccc')],
    });
    const result = toHaveDistinctRegions(terminal);
    expect(result.pass).toBe(true);
  });

  it('fails when duplicate rows exist', () => {
    const terminal = makeTerminal({
      cells: [makeRow('aaa'), makeRow('aaa'), makeRow('ccc')],
    });
    const result = toHaveDistinctRegions(terminal);
    expect(result.pass).toBe(false);
    expect(result.message).toContain('duplicate rows');
  });
});

// ---------------------------------------------------------------------------
// toHaveNoUnexpectedScrollback
// ---------------------------------------------------------------------------
describe('toHaveNoUnexpectedScrollback', () => {
  it('passes when scrollback within limit', () => {
    const terminal = makeTerminal({
      overflow: { horizontal: false, vertical: false, clippedCells: 0, scrollbackLines: 5, unexpectedWrap: false },
    });
    const result = toHaveNoUnexpectedScrollback(terminal, 10);
    expect(result.pass).toBe(true);
  });

  it('fails when scrollback exceeds limit', () => {
    const terminal = makeTerminal({
      overflow: { horizontal: false, vertical: false, clippedCells: 0, scrollbackLines: 20, unexpectedWrap: false },
    });
    const result = toHaveNoUnexpectedScrollback(terminal, 10);
    expect(result.pass).toBe(false);
    expect(result.actual).toBe(20);
    expect(result.expected).toBe(10);
  });
});
