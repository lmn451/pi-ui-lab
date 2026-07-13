// =============================================================================
// Snapshot producer — deterministic snapshots from replay frames
// =============================================================================

import { createHash } from 'node:crypto';
import type {
  ReplayFrame,
  TextSnapshot,
  CellSnapshot,
  SnapshotMetadata,
} from '../types.js';

/**
 * Produce a text snapshot from replay frames.
 */
export function produceTextSnapshot(
  frames: ReplayFrame[],
  metadata: SnapshotMetadata,
): TextSnapshot {
  return {
    frames: frames.map((f) => ({
      index: f.index,
      timeMs: f.timeMs,
      text: f.terminal?.text ?? buildUIText(f),
    })),
    metadata,
  };
}

/**
 * Produce a cell snapshot from replay frames.
 */
export function produceCellSnapshot(
  frames: ReplayFrame[],
  metadata: SnapshotMetadata,
): CellSnapshot {
  return {
    frames: frames.map((f) => ({
      index: f.index,
      timeMs: f.timeMs,
      cells: f.terminal?.cells ?? [],
    })),
    metadata,
  };
}

/**
 * Serialize a snapshot to JSON string with metadata.
 */
export function serializeSnapshot(
  snapshot: TextSnapshot | CellSnapshot,
): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Build default metadata for snapshot production.
 */
export function buildSnapshotMetadata(
  fixtureName: string,
  fixtureHash: string,
  viewport: { cols: number; rows: number },
  theme: string,
): SnapshotMetadata {
  return {
    fixtureName,
    fixtureHash,
    platform: process.platform,
    nodeVersion: process.version,
    timestamp: '1970-01-01T00:00:00.000Z',
    viewport,
    theme,
  };
}

/**
 * Hash fixture content for deterministic metadata.
 */
export function hashFixture(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function buildUIText(frame: ReplayFrame): string {
  const footer = `Status: ${frame.ui.footer.status} | Agents: ${frame.ui.footer.activeAgents}`;
  return footer;
}
