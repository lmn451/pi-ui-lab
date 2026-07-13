// =============================================================================
// Reload handler tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { handleReload } from '../replay/reload-handler.js';
import type { ReloadableState } from '../replay/reload-handler.js';

function makeState(overrides: Partial<ReloadableState> = {}): ReloadableState {
  return {
    ui: {
      footer: { status: 'running', activeAgents: 2 },
      widgets: [{ id: 'w1', label: 'Widget', rows: ['line1'], visible: true }],
      notifications: [
        {
          id: 'n1',
          kind: 'info',
          message: 'Test',
          timestamp: 100,
          dismissed: false,
        },
      ],
      toolRenders: [{ toolName: 'test', content: 'rendered' }],
    },
    recovery: {
      cursors: { session: 'abc123', events: 5 },
      processedReceipts: ['r1', 'r2'],
      artifactEvents: [
        { id: 'a1', type: 'created', timestamp: 50 },
        { id: 'a2', type: 'updated', timestamp: 75 },
      ],
    },
    ...overrides,
  };
}

describe('handleReload', () => {
  it('preserves ui when included in preserve list', () => {
    const state = makeState();
    const result = handleReload(state, ['ui']);

    expect(result.ui).toEqual(state.ui);
    expect(result.recovery.cursors).toEqual({});
    expect(result.recovery.processedReceipts).toEqual([]);
    expect(result.recovery.artifactEvents).toEqual([]);
  });

  it('preserves recovery when included in preserve list', () => {
    const state = makeState();
    const result = handleReload(state, ['recovery']);

    expect(result.recovery).toEqual(state.recovery);
    expect(result.ui.footer.status).toBe('stale');
    expect(result.ui.footer.activeAgents).toBe(0);
    expect(result.ui.widgets).toEqual([]);
  });

  it('preserves both ui and recovery', () => {
    const state = makeState();
    const result = handleReload(state, ['ui', 'recovery']);

    expect(result.ui).toEqual(state.ui);
    expect(result.recovery).toEqual(state.recovery);
  });

  it('resets everything with empty preserve list', () => {
    const state = makeState();
    const result = handleReload(state, []);

    expect(result.ui.footer.status).toBe('stale');
    expect(result.ui.footer.activeAgents).toBe(0);
    expect(result.ui.widgets).toEqual([]);
    expect(result.ui.notifications).toEqual([]);
    expect(result.ui.toolRenders).toEqual([]);
    expect(result.recovery.cursors).toEqual({});
    expect(result.recovery.processedReceipts).toEqual([]);
    expect(result.recovery.artifactEvents).toEqual([]);
  });

  it('creates deep copies to prevent mutation', () => {
    const state = makeState();
    const result = handleReload(state, ['ui', 'recovery']);

    result.ui.footer.activeAgents = 99;
    result.recovery.cursors.new = 'value';

    expect(state.ui.footer.activeAgents).toBe(2);
    expect(state.recovery.cursors).not.toHaveProperty('new');
  });

  it('ignores unknown keys in preserve list', () => {
    const state = makeState();
    const result = handleReload(state, ['unknown', 'alsoUnknown']);

    expect(result.ui.footer.status).toBe('stale');
    expect(result.recovery.cursors).toEqual({});
  });
});
