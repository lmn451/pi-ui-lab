import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileSnapshotStore } from '../runner/snapshot-store.js';
import type { TextSnapshot, CellSnapshot } from '../types.js';

describe('SnapshotStore', () => {
  let tempDir: string;
  let store: FileSnapshotStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'snapshot-store-test-'));
    store = new FileSnapshotStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getSnapshotPath', () => {
    it('generates correct path for text snapshot', () => {
      const path = store.getSnapshotPath('my-fixture', 80, 'dark', 'text');
      expect(path).toBe(join(tempDir, '__snapshots__', 'my-fixture', 'text', '80xdark.json'));
    });

    it('generates correct path for cell snapshot', () => {
      const path = store.getSnapshotPath('my-fixture', 120, 'light', 'cell');
      expect(path).toBe(join(tempDir, '__snapshots__', 'my-fixture', 'cell', '120xlight.json'));
    });
  });

  describe('save and load round-trip', () => {
    it('saves and loads text snapshot', () => {
      const snapshot: TextSnapshot = {
        frames: [{ index: 0, timeMs: 0, text: 'Hello World' }],
        metadata: {
          fixtureName: 'test',
          fixtureHash: 'abc123',
          platform: 'darwin',
          nodeVersion: '22.0.0',
          timestamp: '2024-01-01T00:00:00.000Z',
          viewport: { cols: 80, rows: 24 },
          theme: 'dark',
          executionMode: 'model',
        },
      };

      store.saveTextSnapshot('test-fixture', 80, 'dark', snapshot);
      const loaded = store.loadTextSnapshot('test-fixture', 80, 'dark');

      expect(loaded).toEqual(snapshot);
    });

    it('saves and loads cell snapshot', () => {
      const snapshot: CellSnapshot = {
        frames: [{
          index: 0,
          timeMs: 0,
          cells: [[{ char: 'A', width: 1 }]],
        }],
        metadata: {
          fixtureName: 'test',
          fixtureHash: 'abc123',
          platform: 'darwin',
          nodeVersion: '22.0.0',
          timestamp: '2024-01-01T00:00:00.000Z',
          viewport: { cols: 80, rows: 24 },
          theme: 'dark',
          executionMode: 'model',
        },
      };

      store.saveCellSnapshot('test-fixture', 80, 'dark', snapshot);
      const loaded = store.loadCellSnapshot('test-fixture', 80, 'dark');

      expect(loaded).toEqual(snapshot);
    });
  });

  describe('missing snapshots', () => {
    it('returns null for missing text snapshot', () => {
      const loaded = store.loadTextSnapshot('nonexistent', 80, 'dark');
      expect(loaded).toBeNull();
    });

    it('returns null for missing cell snapshot', () => {
      const loaded = store.loadCellSnapshot('nonexistent', 80, 'dark');
      expect(loaded).toBeNull();
    });
  });

  describe('directory structure', () => {
    it('creates directories on save', () => {
      const snapshot: TextSnapshot = {
        frames: [],
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

      store.saveTextSnapshot('new-fixture', 80, 'dark', snapshot);

      const path = store.getSnapshotPath('new-fixture', 80, 'dark', 'text');
      expect(existsSync(path)).toBe(true);
    });
  });
});
