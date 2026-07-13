import { describe, it, expect } from 'vitest';
import {
  toContainText,
  toHaveStatus,
  toHaveWidgetRows,
  toHaveNotification,
  toHaveCursor,
  toHaveProcessedReceipt,
  toHaveArtifactEvent,
} from '../assertions/semantic.js';
import type { UIState, RecoveryState } from '../types.js';

function makeUI(overrides: Partial<UIState> = {}): UIState {
  return {
    footer: { status: 'running', activeAgents: 1 },
    widgets: [],
    notifications: [],
    toolRenders: [],
    ...overrides,
  };
}

function makeRecovery(overrides: Partial<RecoveryState> = {}): RecoveryState {
  return {
    cursors: {},
    processedReceipts: [],
    artifactEvents: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// toContainText
// ---------------------------------------------------------------------------
describe('toContainText', () => {
  it('passes when text is found', () => {
    const ui = makeUI({ widgets: [{ id: 'w1', label: 'W', rows: ['hello world'], visible: true }] });
    const result = toContainText(ui, 'hello');
    expect(result.pass).toBe(true);
    expect(result.message).toContain('contains text');
  });

  it('fails when text is not found', () => {
    const ui = makeUI({ widgets: [{ id: 'w1', label: 'W', rows: ['abc'], visible: true }] });
    const result = toContainText(ui, 'xyz');
    expect(result.pass).toBe(false);
    expect(result.message).toContain('does not contain');
  });
});

// ---------------------------------------------------------------------------
// toHaveStatus
// ---------------------------------------------------------------------------
describe('toHaveStatus', () => {
  it('passes when status matches', () => {
    const ui = makeUI({ footer: { status: 'completed', activeAgents: 0 } });
    const result = toHaveStatus(ui, 'completed');
    expect(result.pass).toBe(true);
  });

  it('fails when status does not match', () => {
    const ui = makeUI({ footer: { status: 'failed', activeAgents: 0 } });
    const result = toHaveStatus(ui, 'completed');
    expect(result.pass).toBe(false);
    expect(result.actual).toBe('failed');
    expect(result.expected).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// toHaveWidgetRows
// ---------------------------------------------------------------------------
describe('toHaveWidgetRows', () => {
  it('passes when row count matches', () => {
    const ui = makeUI({
      widgets: [{ id: 'w1', label: 'W', rows: ['a', 'b', 'c'], visible: true }],
    });
    const result = toHaveWidgetRows(ui, 'w1', 3);
    expect(result.pass).toBe(true);
  });

  it('fails when widget does not exist', () => {
    const result = toHaveWidgetRows(makeUI(), 'missing', 0);
    expect(result.pass).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('fails when row count does not match', () => {
    const ui = makeUI({
      widgets: [{ id: 'w1', label: 'W', rows: ['a'], visible: true }],
    });
    const result = toHaveWidgetRows(ui, 'w1', 5);
    expect(result.pass).toBe(false);
    expect(result.actual).toBe(1);
    expect(result.expected).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// toHaveNotification
// ---------------------------------------------------------------------------
describe('toHaveNotification', () => {
  it('finds notification by kind', () => {
    const ui = makeUI({
      notifications: [
        { id: 'n1', kind: 'error', message: 'bad', timestamp: 1, dismissed: false },
      ],
    });
    const result = toHaveNotification(ui, { kind: 'error' });
    expect(result.pass).toBe(true);
  });

  it('finds notification by message substring', () => {
    const ui = makeUI({
      notifications: [
        { id: 'n1', kind: 'info', message: 'Operation complete', timestamp: 1, dismissed: false },
      ],
    });
    const result = toHaveNotification(ui, { messageContains: 'complete' });
    expect(result.pass).toBe(true);
  });

  it('fails when no notification matches', () => {
    const ui = makeUI({
      notifications: [
        { id: 'n1', kind: 'info', message: 'hello', timestamp: 1, dismissed: false },
      ],
    });
    const result = toHaveNotification(ui, { kind: 'error' });
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toHaveCursor
// ---------------------------------------------------------------------------
describe('toHaveCursor', () => {
  it('passes when cursor exists with expected value', () => {
    const recovery = makeRecovery({ cursors: { frameIndex: 5 } });
    const result = toHaveCursor(recovery, 'frameIndex', 5);
    expect(result.pass).toBe(true);
  });

  it('fails when cursor does not exist', () => {
    const result = toHaveCursor(makeRecovery(), 'frameIndex', 5);
    expect(result.pass).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// toHaveProcessedReceipt
// ---------------------------------------------------------------------------
describe('toHaveProcessedReceipt', () => {
  it('passes when receipt is processed', () => {
    const recovery = makeRecovery({ processedReceipts: ['r1', 'r2'] });
    const result = toHaveProcessedReceipt(recovery, 'r1');
    expect(result.pass).toBe(true);
  });

  it('fails when receipt is not processed', () => {
    const recovery = makeRecovery({ processedReceipts: ['r1'] });
    const result = toHaveProcessedReceipt(recovery, 'missing');
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toHaveArtifactEvent
// ---------------------------------------------------------------------------
describe('toHaveArtifactEvent', () => {
  it('passes when matching artifact event exists', () => {
    const recovery = makeRecovery({
      artifactEvents: [{ id: 'a1', type: 'created', timestamp: 100 }],
    });
    const result = toHaveArtifactEvent(recovery, { type: 'created' });
    expect(result.pass).toBe(true);
  });

  it('passes when timestamp filter matches', () => {
    const recovery = makeRecovery({
      artifactEvents: [{ id: 'a1', type: 'updated', timestamp: 200 }],
    });
    const result = toHaveArtifactEvent(recovery, { afterTimestamp: 100 });
    expect(result.pass).toBe(true);
  });

  it('fails when no event matches', () => {
    const recovery = makeRecovery({
      artifactEvents: [{ id: 'a1', type: 'deleted', timestamp: 50 }],
    });
    const result = toHaveArtifactEvent(recovery, { type: 'created', afterTimestamp: 100 });
    expect(result.pass).toBe(false);
  });
});
