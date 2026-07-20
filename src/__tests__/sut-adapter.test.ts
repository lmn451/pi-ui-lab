import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PiHarnessSutAdapter } from '../sut/index.js';
import type { Fixture, FixtureEvent } from '../types.js';
import type { ExternalFixtureAdapter, HarnessLike, TestSessionLike } from '../sut/index.js';
import { withVirtualDateNow } from '../process/scoped-virtual-clock.js';

function fixture(timeline: FixtureEvent[]): Fixture {
  return { version: 1, name: 'external', viewport: { cols: 80, rows: 24 }, theme: 'dark', pollIntervalMs: 5, timeline };
}

function fakeHarness(): HarnessLike {
  const session: TestSessionLike = { cwd: '', session: {}, events: { ui: [] }, dispose: () => {} };
  return { createTestSession: async () => session };
}

function registeredExtensionHarness(calls: string[]): HarnessLike {
  let sessionStart: ((reason: string) => void) | undefined;
  const session: TestSessionLike = {
    cwd: '',
    events: { ui: [] },
    session: {
      extensionRunner: {
        emit: (event: { type: string; reason: string }) => {
          if (event.type === 'session_start') sessionStart?.(event.reason);
        },
      },
    },
    dispose: () => {},
  };
  return {
    createTestSession: async () => {
      const extension = {
        on(event: string, handler: (payload: { reason: string }) => void) {
          if (event === 'session_start') sessionStart = (reason) => handler({ reason });
        },
      };
      extension.on('session_start', (event) => calls.push(`session:${event.reason}:${Date.now()}`));
      setInterval(() => calls.push(`poll:${Date.now()}`), 5_000);
      return session;
    },
  };
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

  it('keeps notification timestamps stable across later frames', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pi-ui-lab-sut-time-'));
    try {
      const result = await new PiHarnessSutAdapter(
        { extensionPath: 'external.ts', modulePath: 'module.ts', cwd },
        { harness: fakeHarness(), moduleLoader: async () => ({}), fixtureAdapter: fakeAdapter() },
      ).run(fixture([{ at: 10, type: 'poll' }, { at: 20, type: 'poll' }]));
      expect(result.frames[0]?.ui.notifications.map((item) => item.timestamp)).toEqual([10]);
      expect(result.frames[1]?.ui.notifications.map((item) => item.timestamp)).toEqual([10, 20]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('resets notification timestamp state between adapter runs', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pi-ui-lab-sut-reuse-'));
    try {
      const adapter = new PiHarnessSutAdapter(
        { extensionPath: 'external.ts', modulePath: 'module.ts', cwd },
        { harness: fakeHarness(), moduleLoader: async () => ({}), fixtureAdapter: fakeAdapter() },
      );
      await adapter.run(fixture([{ at: 10, type: 'poll' }]));
      const second = await adapter.run(fixture([{ at: 20, type: 'poll' }]));
      expect(second.frames[0]?.ui.notifications[0]?.timestamp).toBe(20);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('replays the extension-registered session handler and poller in fixture order', async () => {
    const originalNow = Date.now;
    const originalSetInterval = setInterval;
    const originalClearInterval = clearInterval;
    const calls: string[] = [];
    const directPoll = () => { calls.push('direct-poll'); };
    await new PiHarnessSutAdapter(
      { extensionPath: 'external.ts', modulePath: 'module.ts', cwd: '/tmp' },
      { harness: registeredExtensionHarness(calls), moduleLoader: async () => ({ pollArtifactChanges: directPoll }) },
    ).run(fixture([
      { at: 0, type: 'session_start' },
      { at: 5_000, type: 'poll' },
      { at: 10_000, type: 'poll' },
    ]));
    expect(calls).toEqual([
      'session:startup:0',
      'direct-poll',
      'poll:5000',
      'direct-poll',
      'poll:10000',
    ]);
    expect(Date.now).toBe(originalNow);
    expect(setInterval).toBe(originalSetInterval);
    expect(clearInterval).toBe(originalClearInterval);
  });

  it('restores clock and UI globals after a failed fixture event', async () => {
    const globals = globalThis as Record<string, unknown>;
    const originalNow = Date.now;
    const originalSetInterval = setInterval;
    const originalClearInterval = clearInterval;
    const originalPi = Object.getOwnPropertyDescriptor(globals, '__piSubagenturaPiRef');
    const originalUi = Object.getOwnPropertyDescriptor(globals, '__piSubagenturaUi');
    const failingAdapter: ExternalFixtureAdapter = {
      materializeEvent: () => { throw new Error('fixture failed'); },
      invokeEvent: () => {},
      observe: () => ({ ui: { footer: { status: 'stale', activeAgents: 0 }, widgets: [], notifications: [], toolRenders: [] }, recovery: { cursors: {}, processedReceipts: [], artifactEvents: [] } }),
    };
    await expect(new PiHarnessSutAdapter(
      { extensionPath: 'external.ts', modulePath: 'module.ts', cwd: '/tmp' },
      { harness: registeredExtensionHarness([]), moduleLoader: async () => ({}), fixtureAdapter: failingAdapter },
    ).run(fixture([{ at: 0, type: 'session_start' }]))).rejects.toThrow('fixture failed');
    expect(Date.now).toBe(originalNow);
    expect(setInterval).toBe(originalSetInterval);
    expect(clearInterval).toBe(originalClearInterval);
    expect(Object.getOwnPropertyDescriptor(globals, '__piSubagenturaPiRef')).toEqual(originalPi);
    expect(Object.getOwnPropertyDescriptor(globals, '__piSubagenturaUi')).toEqual(originalUi);
  });

  it('restores clock and timer globals when session disposal throws', async () => {
    const originalNow = Date.now;
    const originalSetInterval = setInterval;
    const originalClearInterval = clearInterval;
    const harness: HarnessLike = {
      createTestSession: async () => ({
        cwd: '', session: {}, events: { ui: [] },
        dispose: () => { throw new Error('dispose failed'); },
      }),
    };
    await expect(new PiHarnessSutAdapter(
      { extensionPath: 'external.ts', modulePath: 'module.ts', cwd: '/tmp' },
      { harness, moduleLoader: async () => ({}), fixtureAdapter: fakeAdapter() },
    ).run(fixture([]))).rejects.toThrow('dispose failed');
    expect(Date.now).toBe(originalNow);
    expect(setInterval).toBe(originalSetInterval);
    expect(clearInterval).toBe(originalClearInterval);
  });

  it('rejects a partially specified external boundary', () => {
    expect(() => new PiHarnessSutAdapter({ extensionPath: '', modulePath: 'module.ts', cwd: '/tmp' })).toThrow('extensionPath');
  });

  it('rejects unsupported virtual time scopes and restores Date.now', () => {
    const originalNow = Date.now;
    expect(() => withVirtualDateNow(1, () => withVirtualDateNow(2, () => 2))).toThrow('Concurrent');
    expect(() => withVirtualDateNow(1, () => Promise.resolve())).toThrow('synchronous');
    expect(Date.now).toBe(originalNow);
  });
});

async function clearExternalRegistry(modulePath: string): Promise<void> {
  const loaded = await import(pathToFileURL(modulePath).href) as { interactiveSubagentRegistry?: Map<unknown, unknown> };
  loaded.interactiveSubagentRegistry?.clear();
}

describe('external pi-agents integration', () => {
  const extension = process.env.PI_UI_LAB_SUT_EXTENSION;
  const module = process.env.PI_UI_LAB_SUT_MODULE;
  it.skipIf(!extension || !module)('drives the explicitly configured production interval through the harness', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pi-ui-lab-external-'));
    try {
      const result = await new PiHarnessSutAdapter({ extensionPath: extension!, modulePath: module!, cwd }).run(fixture([
        { at: 0, type: 'session_start' },
        { at: 1, type: 'artifact_created', artifactId: 'agent-1', artifactPath: '.pi/subagentura-artifacts/agent-1' },
        { at: 2, type: 'artifact_updated', artifactId: 'agent-1', name: 'tool' },
        { at: 5_000, type: 'poll' },
      ]));
      expect(result.frames[3]?.ui.footer).toMatchObject({ status: 'running', activeAgents: 1 });
      expect(result.uiCalls.some(call => call.method === 'setStatus' && call.args[0] === 'subagentura-running')).toBe(true);
      expect(result.uiCalls.some(call => call.method === 'setWidget' && call.args[0] === 'subagentura-activity')).toBe(true);
      expect('__piSubagenturaInteractivePollerHandle' in globalThis).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it.skipIf(!extension || !module)('uses production poller time for waiting and stale rows deterministically', async () => {
    const timeline: FixtureEvent[] = [
      { at: 0, type: 'session_start' },
      { at: 2, type: 'artifact_created', artifactId: 'clock-agent', artifactPath: '.pi/subagentura-artifacts/clock-agent' },
      { at: 3, type: 'artifact_updated', artifactId: 'clock-agent', name: 'confirmation' },
      { at: 30_003, type: 'poll' },
      { at: 90_003, type: 'poll' },
    ];
    const run = async (): Promise<string> => {
      const cwd = mkdtempSync(join(tmpdir(), 'pi-ui-lab-clock-'));
      await clearExternalRegistry(module!);
      try {
        const result = await new PiHarnessSutAdapter({ extensionPath: extension!, modulePath: module!, cwd }).run(fixture(timeline));
        expect(result.frames[3]?.ui.widgets[0]?.rows[0]).toContain('(30s ago)');
        expect(result.frames[4]?.ui.widgets[0]?.rows[0]).toContain('(1m ago)');
        return JSON.stringify(result);
      } finally {
        await clearExternalRegistry(module!);
        rmSync(cwd, { recursive: true, force: true });
      }
    };
    const first = await run();
    const second = await run();
    expect(second).toBe(first);
  }, 30_000);
});
