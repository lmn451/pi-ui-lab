import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReplayEngine } from '../replay/replay-engine.js';
import { DeterministicScheduler } from '../scheduler/scheduler.js';
import { VirtualClock } from '../clock/virtual-clock.js';
import { ScopedExternalRuntimeController } from '../process/scoped-virtual-clock.js';
import { buildUiLabCommand } from '../process/pi-pty-runner.js';
import { parseUiLabArgs } from '../pi-extension/index.js';
import { processEvent, type ProcessorState } from '../replay/state-processor.js';
import { handleReload } from '../replay/reload-handler.js';
import { validateFixture } from '../schema/validate.js';
import { FixtureLoader } from '../fixtures/fixture-loader.js';
import { redact } from '../fixtures/redactor.js';
import { captureTerminal } from '../capture/terminal-capture.js';
import { gridToText } from '../capture/cell-grid.js';
import { diffTextSnapshots } from '../runner/snapshot-differ.js';
import { FileSnapshotStore } from '../runner/snapshot-store.js';
import { runTests } from '../runner/test-runner.js';
import { PiHarnessSutAdapter } from '../sut/pi-harness-sut-adapter.js';
import type { Fixture, SnapshotMetadata, TextSnapshot } from '../types.js';
import type { HarnessLike } from '../sut/types.js';

function fixture(timeline: Fixture['timeline']): Fixture {
  return {
    version: 1, name: 'hardening', viewport: { cols: 80, rows: 24 },
    theme: 'dark', pollIntervalMs: 10_000, timeline,
  };
}

function processorState(): ProcessorState {
  return {
    ui: { footer: { status: 'stale', activeAgents: 0 }, widgets: [], notifications: [], toolRenders: [] },
    recovery: { cursors: {}, processedReceipts: [], artifactEvents: [] },
    viewport: { cols: 80, rows: 24 }, theme: 'dark',
  };
}

function metadata(mode: SnapshotMetadata['executionMode'] = 'model'): SnapshotMetadata {
  return {
    fixtureName: 'hardening', fixtureHash: 'hash', platform: 'test', nodeVersion: 'test',
    timestamp: '1970-01-01T00:00:00.000Z', viewport: { cols: 80, rows: 24 },
    theme: 'dark', executionMode: mode,
  };
}

function snapshot(index: number, timeMs: number, text: string): TextSnapshot {
  return { frames: [{ index, timeMs, text }], metadata: metadata() };
}

describe('execution mode and replay hardening', () => {
  it('does not consume an event beyond runUntil cutoff', async () => {
    const engine = new ReplayEngine(fixture([
      { at: 100, type: 'session_start' },
      { at: 300, type: 'done', content: 'later' },
    ]));
    const result = await engine.runUntil(200);
    expect(result.finalState.ui.footer.status).toBe('running');
    expect(engine.step()?.timeMs).toBe(300);
  });

  it('schedules timers registered on the virtual clock', () => {
    const clock = new VirtualClock();
    const observed: string[] = [];
    clock.setTimeout(() => observed.push(`callback:${clock.now()}`), 100);
    const scheduler = new DeterministicScheduler({
      clock, events: [], onEvent: (event, time) => observed.push(`${String(event)}:${time}`),
    });
    expect(scheduler.advance()).toBe('fixture_event');
    expect(observed).toEqual(['callback:100', 'timer:100']);
  });

  it('enforces cumulative duration and clamps negative delays', () => {
    const clock = new VirtualClock({ startTime: 100, maxDuration: 100 });
    let callbackTime = -1;
    clock.setTimeout(() => { callbackTime = clock.now(); }, -10);
    clock.step();
    expect(callbackTime).toBe(100);
    clock.advanceTo(160);
    expect(() => clock.advanceTo(201)).toThrow('max duration');
  });

  it('invokes interval callbacks at each due virtual timestamp', () => {
    const runtime = new ScopedExternalRuntimeController(0);
    const times: number[] = [];
    runtime.install();
    try {
      const handle = setInterval(() => times.push(Date.now()), 100);
      runtime.advanceTo(350);
      clearInterval(handle);
    } finally {
      runtime.restore();
    }
    expect(times).toEqual([100, 200, 300]);
  });

  it('requires an external SUT for sut and pty modes', async () => {
    const base = {
      patterns: ['fixtures/lifecycle-running.json'], update: false, matrix: false,
      reporter: 'json' as const,
    };
    await expect(runTests({ ...base, mode: 'sut' })).rejects.toThrow('requires');
    await expect(runTests({ ...base, mode: 'pty' })).rejects.toThrow('requires');
  });

  it('honors explicit model width and theme', async () => {
    const result = await runTests({
      patterns: ['fixtures/lifecycle-running.json'], update: false, matrix: false,
      mode: 'model', reporter: 'json', widths: [123], themes: ['light'],
    });
    expect(result.results[0]).toMatchObject({ mode: 'model', width: 123, theme: 'light' });
  });

  it('keeps snapshots for same-basename fixtures separate', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pi-ui-lab-same-name-'));
    try {
      const first = join(directory, 'a', 'same.json');
      const second = join(directory, 'b', 'same.json');
      mkdirSync(dirname(first), { recursive: true });
      mkdirSync(dirname(second), { recursive: true });
      writeFileSync(first, JSON.stringify({ ...fixture([{ at: 0, type: 'session_start' }, { at: 1, type: 'checkpoint', name: 'done' }]), name: 'first' }));
      writeFileSync(second, JSON.stringify({ ...fixture([{ at: 0, type: 'session_start' }, { at: 1, type: 'checkpoint', name: 'done' }]), name: 'second' }));
      const result = await runTests({
        patterns: [first, second], update: true, matrix: false, mode: 'model', reporter: 'json',
        snapshotDir: directory,
      });
      expect(result.total).toBe(2);
      expect(readdirSync(join(directory, '__snapshots__'))).toHaveLength(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('fixture and recovery hardening', () => {
  it('rejects structurally incomplete typed events', () => {
    expect(validateFixture({ ...fixture([]), timeline: [{ at: 0, type: 'resize' }] }).valid).toBe(false);
  });

  it('validates imported events before merging them', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pi-ui-lab-import-'));
    try {
      writeFileSync(join(directory, 'events.json'), JSON.stringify([{ at: 1, type: 'not_real' }]));
      const root = { ...fixture([]), imports: [{ source: 'events.json' }] };
      await expect(new FixtureLoader().loadFromString(JSON.stringify(root), join(directory, 'fixture.json')))
        .rejects.toThrow('Invalid fixture import');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('preserves named cursors and suppresses duplicate receipts', () => {
    let state = processorState();
    state = processEvent({ at: 0, type: 'state_written', key: 'cursor-index', value: 5 }, state);
    state = processEvent({ at: 1, type: 'state_written', key: 'cursor-index', value: 6 }, state);
    const reloaded = handleReload({ ui: state.ui, recovery: state.recovery }, ['cursor-index', 'processedReceipts']);
    expect(reloaded.recovery.cursors['cursor-index']).toBe(6);
    expect(reloaded.recovery.processedReceipts).toEqual(['cursor-index']);
  });

  it('honors custom redaction replacements', () => {
    expect(redact('token=supersecret', { secretReplacement: '[SECRET]' })).toBe('token=[SECRET]');
  });

  it('rejects traversal through artifact IDs', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pi-ui-lab-sut-path-'));
    const harness: HarnessLike = {
      createTestSession: async () => ({ cwd, session: {}, events: { ui: [] }, dispose: () => {} }),
    };
    try {
      await expect(new PiHarnessSutAdapter(
        { extensionPath: 'extension.ts', modulePath: 'module.ts', cwd },
        { harness, moduleLoader: async () => ({}) },
      ).run(fixture([{ at: 0, type: 'artifact_updated', artifactId: '../../../escaped' }])))
        .rejects.toThrow('Unsafe artifact id');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('terminal and snapshot hardening', () => {
  it('retains content when output exactly fills the screen', () => {
    const terminal = captureTerminal('abcdef', { cols: 3, rows: 2 });
    expect(gridToText(terminal.cells)).toBe('abc\ndef');
    expect(terminal.cursor).toMatchObject({ row: 1, col: 2 });
  });

  it('preserves one-row grid dimensions while scrolling', () => {
    const terminal = captureTerminal('\nB', { cols: 3, rows: 1 });
    expect(terminal.cells[0]).toHaveLength(3);
    expect(gridToText(terminal.cells)).toBe('B');
  });

  it('does not scroll content for cursor-down and clears wide continuations', () => {
    const moved = captureTerminal('A\x1b[9B', { cols: 3, rows: 2 });
    expect(gridToText(moved.cells)).toBe('A\n');
    const overwritten = captureTerminal('界\rA', { cols: 3, rows: 1 });
    expect(overwritten.overflow.collision).toBe(false);
  });

  it('reports parser scrollback as vertical overflow', () => {
    const terminal = captureTerminal('a\nb\nc', { cols: 3, rows: 2 });
    expect(terminal.overflow).toMatchObject({ vertical: true, scrollbackLines: 1 });
  });

  it('handles erase mode 1, grapheme width, and initial cursor placement', () => {
    const erased = captureTerminal('AB\x1b[2;2HC\x1b[1J', { cols: 3, rows: 2 });
    expect(gridToText(erased.cells)).toBe('\n');
    const emoji = captureTerminal('👩‍💻X', { cols: 6, rows: 1 });
    expect(emoji.cells[0].findIndex((cell) => cell.char === 'X')).toBe(2);
    const positioned = captureTerminal('X', { cols: 4, rows: 3 }, { row: 1, col: 2, visible: true });
    expect(positioned.cells[1][2].char).toBe('X');
  });

  it('quotes PTY fixture paths and forwards themes', () => {
    const command = buildUiLabCommand('/tmp/my fixture.json', {
      fixture: '/tmp/my fixture.json', cols: 80, rows: 24, theme: 'light',
    });
    const parsed = parseUiLabArgs(command.replace(/^\/ui-lab\s+/u, ''));
    expect(parsed).toMatchObject({
      fixturePath: '/tmp/my fixture.json', viewport: { cols: 80, rows: 24 }, theme: 'light',
    });
  });

  it('compares frame identity, timing, trailing lines, and execution mode', () => {
    expect(diffTextSnapshots(snapshot(0, 0, 'line'), snapshot(1, 10, 'line'), 'x', 80, 'dark').match).toBe(false);
    expect(diffTextSnapshots(snapshot(0, 0, 'line\n'), snapshot(0, 0, 'line'), 'x', 80, 'dark').match).toBe(false);
    expect(diffTextSnapshots(
      snapshot(0, 0, 'same'), snapshot(0, 0, 'same\n(missing line)'), 'x', 80, 'dark',
    ).match).toBe(false);
    const otherMode = snapshot(0, 0, 'line');
    otherMode.metadata = metadata('sut');
    expect(diffTextSnapshots(snapshot(0, 0, 'line'), otherMode, 'x', 80, 'dark').match).toBe(false);
  });

  it('throws for corrupt snapshots instead of treating them as absent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pi-ui-lab-snapshot-'));
    try {
      const store = new FileSnapshotStore(directory);
      const path = store.getSnapshotPath('broken', 80, 'dark', 'text');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, '{not json');
      expect(() => store.loadTextSnapshot('broken', 80, 'dark')).toThrow('Failed to load snapshot');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
