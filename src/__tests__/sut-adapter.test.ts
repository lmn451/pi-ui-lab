import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PiHarnessSutAdapter } from '../sut/index.js';
import type { Fixture, FixtureEvent } from '../types.js';
import type { ExternalFixtureAdapter, HarnessLike, TestSessionLike } from '../sut/index.js';

function fixture(timeline: FixtureEvent[]): Fixture {
  return { version: 1, name: 'external', viewport: { cols: 80, rows: 24 }, theme: 'dark', pollIntervalMs: 5, timeline };
}

function fakeHarness(): HarnessLike {
  const session: TestSessionLike = { cwd: '', session: {}, events: { ui: [] }, dispose: () => {} };
  return { createTestSession: async () => session };
}

function fakeAdapter(): ExternalFixtureAdapter {
  return {
    materializeEvent: () => {},
    invokeEvent(event, context) {
      if (event.type === 'poll') {
        context.uiCalls.push({ method: 'setStatus', args: ['subagentura-running', '⚡ 1 sub-agent running'] });
        context.uiCalls.push({ method: 'setWidget', args: ['subagentura-activity', ['▶ worker: waiting [stale]']] });
        context.notificationCalls.push({ method: 'sendMessage', args: [{ content: 'done' }, { deliverAs: 'followUp' }] });
      }
    },
    observe: () => ({ ui: { footer: { status: 'stale', activeAgents: 0 }, widgets: [], notifications: [], toolRenders: [] }, recovery: { cursors: {}, processedReceipts: [], artifactEvents: [] } }),
  };
}

describe('PiHarnessSutAdapter', () => {
  it('maps injected real-boundary calls without synthetic state processing', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pi-ui-lab-sut-'));
    try {
      const result = await new PiHarnessSutAdapter(
        { extensionPath: 'external.ts', modulePath: 'module.ts', cwd },
        { harness: fakeHarness(), moduleLoader: async () => ({}), fixtureAdapter: fakeAdapter(), now: () => 42 },
      ).run(fixture([{ at: 10, type: 'poll' }]));
      expect(result.frames[0]?.ui.footer).toMatchObject({ status: 'running', activeAgents: 1 });
      expect(result.frames[0]?.ui.widgets[0]?.rows).toContain('▶ worker: waiting [stale]');
      expect(result.ui.notifications[0]?.message).toBe('done');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects a partially specified external boundary', () => {
    expect(() => new PiHarnessSutAdapter({ extensionPath: '', modulePath: 'module.ts', cwd: '/tmp' })).toThrow('extensionPath');
  });
});

describe('external pi-agents integration', () => {
  const extension = process.env.PI_UI_LAB_SUT_EXTENSION;
  const module = process.env.PI_UI_LAB_SUT_MODULE;
  it.skipIf(!extension || !module)('loads the explicitly configured production extension and observes real boundaries', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pi-ui-lab-external-'));
    try {
      const result = await new PiHarnessSutAdapter({ extensionPath: extension!, modulePath: module!, cwd }).run(fixture([
        { at: 0, type: 'session_start' },
        { at: 1, type: 'artifact_created', artifactId: 'agent-1', artifactPath: '.pi/subagentura-artifacts/agent-1' },
        { at: 2, type: 'artifact_updated', artifactId: 'agent-1', name: 'tool' },
        { at: 3, type: 'poll' },
        { at: 4, type: 'waiting', agentId: 'agent-1', reason: 'confirmation' },
        { at: 5, type: 'poll' },
        { at: 6, type: 'done', agentId: 'agent-1', content: 'done output' },
        { at: 7, type: 'poll' },
        { at: 8, type: 'poll' },
        { at: 9, type: 'failed', agentId: 'agent-1', error: 'failed output' },
        { at: 10, type: 'poll' },
        { at: 11, type: 'poll' },
        { at: 12, type: 'state_written', key: 'cursor-only', value: 42 },
      ]));
      expect(result.frames).toHaveLength(13);
      expect(result.frames[3]?.ui.footer).toMatchObject({ status: 'running', activeAgents: 1 });
      expect(result.frames[6]?.ui.footer.status).toBe('stale');
      expect(result.frames.some(frame => frame.ui.widgets.some(widget => widget.visible))).toBe(true);
      expect(result.frames.some(frame => frame.ui.widgets.some(widget => widget.rows.some(row => row.includes('idle/awaiting follow-up'))))).toBe(true);
      expect(result.uiCalls.some(call => call.method === 'setStatus' && call.args[0] === 'subagentura-running')).toBe(true);
      expect(result.uiCalls.some(call => call.method === 'setWidget' && call.args[0] === 'subagentura-activity')).toBe(true);
      expect(result.recovery.artifactEvents.map(event => event.type)).toEqual(
        expect.arrayContaining(['started', 'tool_activity', 'done', 'error']),
      );
      expect(result.notifications).toHaveLength(2);
      expect(result.notifications.map(call => (call.args[0] as { details?: { event?: { type?: string } } }).details?.event?.type)).toEqual(
        expect.arrayContaining(['done', 'error']),
      );
      expect(result.ui.notifications.map(notification => notification.message)).toEqual(
        expect.arrayContaining([expect.stringContaining('failed output')]),
      );
      expect(result.recovery.cursors['cursor-only']).toBe(42);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
