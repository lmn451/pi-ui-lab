// Snapshot store - manage snapshot files on disk
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CellSnapshot, TextSnapshot } from '../types.js';

const SNAPSHOTS_DIR = '__snapshots__';
export type SnapshotKind = 'text' | 'cell';

export interface SnapshotStore {
  loadTextSnapshot(fixtureName: string, width: number, theme: string): TextSnapshot | null;
  loadCellSnapshot(fixtureName: string, width: number, theme: string): CellSnapshot | null;
  saveTextSnapshot(fixtureName: string, width: number, theme: string, snapshot: TextSnapshot): void;
  saveCellSnapshot(fixtureName: string, width: number, theme: string, snapshot: CellSnapshot): void;
  getSnapshotPath(fixtureName: string, width: number, theme: string, type: SnapshotKind): string;
}

function pathSegment(value: string): string {
  if (value.length === 0 || value === '.' || value === '..') throw new Error('Snapshot path segment cannot be empty or relative');
  return encodeURIComponent(value);
}

export class FileSnapshotStore implements SnapshotStore {
  constructor(private readonly basePath: string = process.cwd()) {}

  getSnapshotPath(fixtureName: string, width: number, theme: string, type: SnapshotKind): string {
    if (!Number.isInteger(width) || width < 1) throw new Error('Snapshot width must be a positive integer');
    return join(this.basePath, SNAPSHOTS_DIR, pathSegment(fixtureName), type, `${width}x${pathSegment(theme)}.json`);
  }

  loadTextSnapshot(fixtureName: string, width: number, theme: string): TextSnapshot | null {
    return this.loadSnapshot(this.getSnapshotPath(fixtureName, width, theme, 'text'));
  }

  loadCellSnapshot(fixtureName: string, width: number, theme: string): CellSnapshot | null {
    return this.loadSnapshot(this.getSnapshotPath(fixtureName, width, theme, 'cell'));
  }

  saveTextSnapshot(fixtureName: string, width: number, theme: string, snapshot: TextSnapshot): void {
    this.saveSnapshot(this.getSnapshotPath(fixtureName, width, theme, 'text'), snapshot);
  }

  saveCellSnapshot(fixtureName: string, width: number, theme: string, snapshot: CellSnapshot): void {
    this.saveSnapshot(this.getSnapshotPath(fixtureName, width, theme, 'cell'), snapshot);
  }

  private loadSnapshot<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as T;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load snapshot ${path}: ${detail}`, { cause: error });
    }
  }

  private saveSnapshot<T>(path: string, snapshot: T): void {
    const directory = dirname(path);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
    writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  }
}
