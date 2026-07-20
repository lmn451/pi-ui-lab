import { describe, it, expect } from 'vitest';
import { diffTextSnapshots, diffCellSnapshots } from '../runner/snapshot-differ.js';
import type { TextSnapshot, CellSnapshot } from '../types.js';

function makeTextSnapshot(text: string): TextSnapshot {
  return {
    frames: [{ index: 0, timeMs: 0, text }],
    metadata: {
      fixtureName: 'test',
      fixtureHash: 'abc',
      platform: 'test',
      nodeVersion: '1.0.0',
      timestamp: '',
      viewport: { cols: 80, rows: 24 },
      theme: 'dark',
      executionMode: 'model',
    },
  };
}

function makeCellSnapshot(text: string): CellSnapshot {
  return {
    frames: [{
      index: 0,
      timeMs: 0,
      cells: text.split('\n').map((line) =>
        line.split('').map((char) => ({ char, width: 1 })),
      ),
    }],
    metadata: {
      fixtureName: 'test',
      fixtureHash: 'abc',
      platform: 'test',
      nodeVersion: '1.0.0',
      timestamp: '',
      viewport: { cols: 80, rows: 24 },
      theme: 'dark',
      executionMode: 'model',
    },
  };
}

describe('SnapshotDiffer', () => {
  describe('diffTextSnapshots', () => {
    it('identical snapshots match', () => {
      const expected = makeTextSnapshot('Hello\nWorld');
      const actual = makeTextSnapshot('Hello\nWorld');

      const diff = diffTextSnapshots(expected, actual, 'test', 80, 'dark');

      expect(diff.match).toBe(true);
      expect(diff.differences).toHaveLength(0);
    });

    it('detects different text', () => {
      const expected = makeTextSnapshot('Hello\nWorld');
      const actual = makeTextSnapshot('Hello\nUniverse');

      const diff = diffTextSnapshots(expected, actual, 'test', 80, 'dark');

      expect(diff.match).toBe(false);
      expect(diff.differences.length).toBeGreaterThan(0);
      expect(diff.differences[0].expected).toBe('World');
      expect(diff.differences[0].actual).toBe('Universe');
    });

    it('detects missing frames', () => {
      const expected: TextSnapshot = {
        frames: [
          { index: 0, timeMs: 0, text: 'Frame 0' },
          { index: 1, timeMs: 100, text: 'Frame 1' },
        ],
        metadata: {
          fixtureName: 'test',
          fixtureHash: 'abc',
          platform: 'test',
          nodeVersion: '1.0.0',
          timestamp: '',
          viewport: { cols: 80, rows: 24 },
          theme: 'dark',
          executionMode: 'model',
        },
      };
      const actual = makeTextSnapshot('Frame 0');

      const diff = diffTextSnapshots(expected, actual, 'test', 80, 'dark');

      expect(diff.match).toBe(false);
      expect(diff.differences[0].actual).toBe('(missing frame)');
    });

    it('provides line-level diff info', () => {
      const expected = makeTextSnapshot('Line 1\nLine 2\nLine 3');
      const actual = makeTextSnapshot('Line 1\nModified\nLine 3');

      const diff = diffTextSnapshots(expected, actual, 'test', 80, 'dark');

      expect(diff.match).toBe(false);
      const lineDiff = diff.differences.find((d) => d.line === 2);
      expect(lineDiff).toBeDefined();
      expect(lineDiff?.expected).toBe('Line 2');
      expect(lineDiff?.actual).toBe('Modified');
    });
  });

  describe('diffCellSnapshots', () => {
    it('identical cells match', () => {
      const expected = makeCellSnapshot('AB\nCD');
      const actual = makeCellSnapshot('AB\nCD');

      const diff = diffCellSnapshots(expected, actual, 'test', 80, 'dark');

      expect(diff.match).toBe(true);
      expect(diff.differences).toHaveLength(0);
    });

    it('detects different cells', () => {
      const expected = makeCellSnapshot('AB\nCD');
      const actual = makeCellSnapshot('AX\nCD');

      const diff = diffCellSnapshots(expected, actual, 'test', 80, 'dark');

      expect(diff.match).toBe(false);
      expect(diff.differences.length).toBeGreaterThan(0);
    });
  });

  describe('metadata', () => {
    it('includes fixture info in diff', () => {
      const expected = makeTextSnapshot('A');
      const actual = makeTextSnapshot('B');

      const diff = diffTextSnapshots(expected, actual, 'my-fixture', 120, 'light');

      expect(diff.fixtureName).toBe('my-fixture');
      expect(diff.width).toBe(120);
      expect(diff.theme).toBe('light');
    });
  });
});
