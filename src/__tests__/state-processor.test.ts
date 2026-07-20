// =============================================================================
// State processor tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { processEvent, type ProcessorState } from '../replay/state-processor.js';
import type { FixtureEvent } from '../types.js';

function makeState(overrides: Partial<ProcessorState> = {}): ProcessorState {
  return {
    ui: {
      footer: { status: 'stale', activeAgents: 0 },
      widgets: [],
      notifications: [],
      toolRenders: [],
    },
    recovery: {
      cursors: {},
      processedReceipts: [],
      artifactEvents: [],
    },
    viewport: { cols: 80, rows: 24 },
    theme: 'default',
    ...overrides,
  };
}

describe('processEvent', () => {
  describe('session_start', () => {
    it('starts a session without counting it as a subagent', () => {
      const state = makeState();
      const event: FixtureEvent = { at: 100, type: 'session_start' };
      const result = processEvent(event, state);

      expect(result.ui.footer.status).toBe('running');
      expect(result.ui.footer.activeAgents).toBe(0);
    });
  });

  describe('subagent_started', () => {
    it('increments activeAgents', () => {
      const state = makeState({
        ui: { ...makeState().ui, footer: { status: 'running', activeAgents: 1 } },
      });
      const event: FixtureEvent = {
        at: 200,
        type: 'subagent_started',
        agentId: 'a1',
        agentName: 'Test Agent',
      };
      const result = processEvent(event, state);

      expect(result.ui.footer.activeAgents).toBe(2);
    });
  });

  describe('activity', () => {
    it('sets status to running', () => {
      const state = makeState({
        ui: { ...makeState().ui, footer: { status: 'waiting', activeAgents: 1 } },
      });
      const event: FixtureEvent = { at: 300, type: 'activity', content: 'hello' };
      const result = processEvent(event, state);

      expect(result.ui.footer.status).toBe('running');
    });
  });

  describe('waiting', () => {
    it('sets status to waiting', () => {
      const state = makeState({
        ui: { ...makeState().ui, footer: { status: 'running', activeAgents: 1 } },
      });
      const event: FixtureEvent = { at: 400, type: 'waiting', reason: 'idle' };
      const result = processEvent(event, state);

      expect(result.ui.footer.status).toBe('waiting');
    });
  });

  describe('done', () => {
    it('decrements activeAgents and adds notification', () => {
      const state = makeState({
        ui: { ...makeState().ui, footer: { status: 'running', activeAgents: 2 } },
      });
      const event: FixtureEvent = {
        at: 500,
        type: 'done',
        content: 'finished',
      };
      const result = processEvent(event, state);

      expect(result.ui.footer.activeAgents).toBe(1);
      expect(result.ui.footer.status).toBe('running');
      expect(result.ui.notifications).toHaveLength(1);
      expect(result.ui.notifications[0].kind).toBe('success');
      expect(result.ui.notifications[0].message).toBe('finished');
    });

    it('does not go below 0 activeAgents', () => {
      const state = makeState();
      const event: FixtureEvent = { at: 500, type: 'done' };
      const result = processEvent(event, state);

      expect(result.ui.footer.activeAgents).toBe(0);
    });
  });

  describe('failed', () => {
    it('decrements activeAgents and adds error notification', () => {
      const state = makeState({
        ui: { ...makeState().ui, footer: { status: 'running', activeAgents: 1 } },
      });
      const event: FixtureEvent = {
        at: 600,
        type: 'failed',
        error: 'timeout',
      };
      const result = processEvent(event, state);

      expect(result.ui.footer.activeAgents).toBe(0);
      expect(result.ui.footer.status).toBe('failed');
      expect(result.ui.notifications).toHaveLength(1);
      expect(result.ui.notifications[0].kind).toBe('error');
    });
  });

  describe('artifact_created', () => {
    it('adds artifact event to recovery', () => {
      const state = makeState();
      const event: FixtureEvent = {
        at: 700,
        type: 'artifact_created',
        artifactId: 'a1',
        artifactPath: '/path/to/file',
      };
      const result = processEvent(event, state);

      expect(result.recovery.artifactEvents).toHaveLength(1);
      expect(result.recovery.artifactEvents[0].id).toBe('a1');
      expect(result.recovery.artifactEvents[0].type).toBe('created');
    });
  });

  describe('artifact_updated', () => {
    it('adds update event to recovery', () => {
      const state = makeState();
      const event: FixtureEvent = {
        at: 800,
        type: 'artifact_updated',
        artifactId: 'a1',
      };
      const result = processEvent(event, state);

      expect(result.recovery.artifactEvents).toHaveLength(1);
      expect(result.recovery.artifactEvents[0].type).toBe('updated');
    });
  });

  describe('state_written', () => {
    it('updates cursors and adds to processedReceipts', () => {
      const state = makeState();
      const event: FixtureEvent = {
        at: 900,
        type: 'state_written',
        key: 'cursor',
        value: 42,
      };
      const result = processEvent(event, state);

      expect(result.recovery.cursors.cursor).toBe(42);
      expect(result.recovery.processedReceipts).toContain('cursor');
    });
  });

  describe('reload', () => {
    it('preserves only declared stores', () => {
      const state = makeState({
        ui: { ...makeState().ui, footer: { status: 'running', activeAgents: 1 } },
      });
      const event: FixtureEvent = {
        at: 1000,
        type: 'reload',
        preserve: ['recovery'],
      };
      const result = processEvent(event, state);

      expect(result.ui.footer.status).toBe('stale');
      expect(result.ui.footer.activeAgents).toBe(0);
      expect(result.recovery.cursors).toEqual(state.recovery.cursors);
    });
  });

  describe('resize', () => {
    it('updates viewport', () => {
      const state = makeState();
      const event: FixtureEvent = {
        at: 1100,
        type: 'resize',
        cols: 120,
        rows: 40,
      };
      const result = processEvent(event, state);

      expect(result.viewport).toEqual({ cols: 120, rows: 40 });
    });
  });

  describe('theme_changed', () => {
    it('updates theme', () => {
      const state = makeState();
      const event: FixtureEvent = {
        at: 1200,
        type: 'theme_changed',
        theme: 'dark',
      };
      const result = processEvent(event, state);

      expect(result.theme).toBe('dark');
    });
  });

  describe('multiple events', () => {
    it('accumulates state changes correctly', () => {
      let state = makeState();

      state = processEvent(
        { at: 100, type: 'session_start' },
        state,
      );
      state = processEvent(
        { at: 200, type: 'subagent_started', agentId: 'a1', agentName: 'Agent 1' },
        state,
      );
      state = processEvent(
        { at: 300, type: 'subagent_started', agentId: 'a2', agentName: 'Agent 2' },
        state,
      );
      state = processEvent(
        { at: 400, type: 'done', content: 'Task 1 done' },
        state,
      );

      expect(state.ui.footer.status).toBe('running');
      expect(state.ui.footer.activeAgents).toBe(1);
      expect(state.ui.notifications).toHaveLength(1);
    });
  });
});
