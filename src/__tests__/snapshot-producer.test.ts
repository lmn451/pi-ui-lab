// =============================================================================
// Snapshot producer tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  produceTextSnapshot,
  produceCellSnapshot,
  serializeSnapshot,
  buildSnapshotMetadata,
  hashFixture,
} from '../replay/snapshot-producer.js';
import type { ReplayFrame, SnapshotMetadata } from '../types.js';

function makeFrame(index: number, timeMs: number): ReplayFrame {
  return {
    index,
    timeMs,
    cause: 'fixture_event',
    viewport: { cols: 80, rows: 24 },
    theme: 'default',
    ui: {
      footer: { status: 'running', activeAgents: 1 },
      widgets: [],
      notifications: [],
      toolRenders: [],
    },
    recovery: {
      cursors: {},
      processedReceipts: [],
      artifactEvents: [],
    },
  };
}

function makeMetadata(): SnapshotMetadata {
  return {
    fixtureName: 'test-fixture',
    fixtureHash: 'abc123def456',
    platform: 'linux',
    nodeVersion: 'v22.0.0',
    timestamp: '2024-01-15T10:30:00.000Z',
    viewport: { cols: 80, rows: 24 },
    theme: 'default',
  };
}

describe('produceTextSnapshot', () => {
  it('creates text snapshot from frames', () => {
    const frames = [makeFrame(0, 0), makeFrame(1, 100)];
    const metadata = makeMetadata();

    const snapshot = produceTextSnapshot(frames, metadata);

    expect(snapshot.frames).toHaveLength(2);
    expect(snapshot.frames[0].index).toBe(0);
    expect(snapshot.frames[0].timeMs).toBe(0);
    expect(snapshot.frames[0].text).toContain('running');
    expect(snapshot.metadata).toEqual(metadata);
  });

  it('uses terminal text when available', () => {
    const frames = [
      {
        ...makeFrame(0, 0),
        terminal: {
          ansi: 'test',
          text: 'Hello World',
          cells: [],
          cursor: { row: 0, col: 0, visible: true },
          overflow: {
            horizontal: false,
            vertical: false,
            clippedCells: 0,
            scrollbackLines: 0,
            unexpectedWrap: false,
          },
        },
      },
    ];
    const metadata = makeMetadata();

    const snapshot = produceTextSnapshot(frames, metadata);

    expect(snapshot.frames[0].text).toBe('Hello World');
  });
});

describe('produceCellSnapshot', () => {
  it('creates cell snapshot from frames', () => {
    const frames = [makeFrame(0, 0)];
    const metadata = makeMetadata();

    const snapshot = produceCellSnapshot(frames, metadata);

    expect(snapshot.frames).toHaveLength(1);
    expect(snapshot.frames[0].cells).toEqual([]);
    expect(snapshot.metadata).toEqual(metadata);
  });

  it('uses terminal cells when available', () => {
    const cells = [[{ char: 'H', width: 1 }]];
    const frames = [
      {
        ...makeFrame(0, 0),
        terminal: {
          ansi: 'test',
          text: '',
          cells,
          cursor: { row: 0, col: 0, visible: true },
          overflow: {
            horizontal: false,
            vertical: false,
            clippedCells: 0,
            scrollbackLines: 0,
            unexpectedWrap: false,
          },
        },
      },
    ];
    const metadata = makeMetadata();

    const snapshot = produceCellSnapshot(frames, metadata);

    expect(snapshot.frames[0].cells).toEqual(cells);
  });
});

describe('serializeSnapshot', () => {
  it('serializes to JSON string', () => {
    const frames = [makeFrame(0, 0)];
    const metadata = makeMetadata();
    const snapshot = produceTextSnapshot(frames, metadata);

    const serialized = serializeSnapshot(snapshot);
    const parsed = JSON.parse(serialized);

    expect(parsed.frames).toHaveLength(1);
    expect(parsed.metadata.fixtureName).toBe('test-fixture');
  });

  it('produces deterministic output', () => {
    const frames = [makeFrame(0, 0)];
    const metadata = makeMetadata();
    const snapshot = produceTextSnapshot(frames, metadata);

    const serialized1 = serializeSnapshot(snapshot);
    const serialized2 = serializeSnapshot(snapshot);

    expect(serialized1).toBe(serialized2);
  });
});

describe('buildSnapshotMetadata', () => {
  it('includes platform and node version', () => {
    const metadata = buildSnapshotMetadata(
      'test',
      'hash123',
      { cols: 80, rows: 24 },
      'default',
    );

    expect(metadata.platform).toBe(process.platform);
    expect(metadata.nodeVersion).toBe(process.version);
    expect(metadata.fixtureName).toBe('test');
    expect(metadata.fixtureHash).toBe('hash123');
    expect(metadata.viewport).toEqual({ cols: 80, rows: 24 });
    expect(metadata.theme).toBe('default');
    expect(metadata.timestamp).toBeDefined();
  });
});

describe('hashFixture', () => {
  it('produces consistent hash', () => {
    const content = JSON.stringify({ name: 'test', version: 1 });

    const hash1 = hashFixture(content);
    const hash2 = hashFixture(content);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it('produces different hash for different content', () => {
    const hash1 = hashFixture('content1');
    const hash2 = hashFixture('content2');

    expect(hash1).not.toBe(hash2);
  });
});
