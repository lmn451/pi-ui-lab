// =============================================================================
// ReplayEngine tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { ReplayEngine } from '../replay/replay-engine.js';
import type { Fixture } from '../types.js';

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    version: 1,
    name: 'test-fixture',
    viewport: { cols: 80, rows: 24 },
    theme: 'default',
    pollIntervalMs: 10000,
    timeline: [
      { at: 100, type: 'session_start' },
      { at: 200, type: 'activity', content: 'working' },
      { at: 300, type: 'done', content: 'completed' },
    ],
    ...overrides,
  };
}

describe('ReplayEngine', () => {
  describe('run()', () => {
    it('creates frames from a simple fixture', async () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      const result = await engine.run();

      expect(result.frames).toHaveLength(3);
      engine.dispose();
    });

    it('frame count matches event count', async () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      const result = await engine.run();

      expect(result.frames.length).toBe(fixture.timeline.length);
      engine.dispose();
    });

    it('produces deterministic frames', async () => {
      const fixture = makeFixture();
      const engine1 = new ReplayEngine(fixture);
      const engine2 = new ReplayEngine(fixture);

      const result1 = await engine1.run();
      const result2 = await engine2.run();

      expect(result1.frames).toEqual(result2.frames);
      engine1.dispose();
      engine2.dispose();
    });

    it('includes initial frame', async () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      const result = await engine.run();

      expect(result.frames[0].cause).toBe('fixture_event');
      engine.dispose();
    });
  });

  describe('runUntil()', () => {
    it('runs up to a specific time', async () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      const result = await engine.runUntil(250);

      expect(result.frames.length).toBeLessThanOrEqual(2);
      engine.dispose();
    });
  });

  describe('runToCheckpoint()', () => {
    it('runs up to a named checkpoint', async () => {
      const fixture = makeFixture({
        timeline: [
          { at: 100, type: 'session_start' },
          { at: 200, type: 'checkpoint', name: 'midpoint' },
          { at: 300, type: 'done', content: 'completed' },
        ],
      });
      const engine = new ReplayEngine(fixture);

      const result = await engine.runToCheckpoint('midpoint');

      expect(result.checkpoints.has('midpoint')).toBe(true);
      expect(result.frames.length).toBeLessThanOrEqual(3);
      engine.dispose();
    });
  });

  describe('checkpoints', () => {
    it('records checkpoints correctly', async () => {
      const fixture = makeFixture({
        timeline: [
          { at: 100, type: 'session_start' },
          { at: 200, type: 'checkpoint', name: 'start' },
          { at: 300, type: 'done', content: 'completed' },
          { at: 400, type: 'checkpoint', name: 'end' },
        ],
      });
      const engine = new ReplayEngine(fixture);

      const result = await engine.run();

      expect(result.checkpoints.get('start')).toBe(1);
      expect(result.checkpoints.get('end')).toBe(3);
      engine.dispose();
    });
  });

  describe('step()', () => {
    it('advances one step at a time', async () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      const frame1 = engine.step();
      const frame2 = engine.step();
      const frame3 = engine.step();
      const frame4 = engine.step();

      expect(frame1).not.toBeNull();
      expect(frame2).not.toBeNull();
      expect(frame3).not.toBeNull();
      expect(frame1!.index).toBe(0);
      expect(frame2!.index).toBe(1);
      expect(frame3!.index).toBe(2);
      expect(frame4).toBeNull();
      engine.dispose();
    });

    it('produces same result as run()', async () => {
      const fixture = makeFixture();
      const engine1 = new ReplayEngine(fixture);
      const engine2 = new ReplayEngine(fixture);

      const framesFromStep: ReturnType<ReplayEngine['step']>[] = [];
      let frame = engine1.step();
      while (frame !== null) {
        framesFromStep.push(frame);
        frame = engine1.step();
      }

      const result = await engine2.run();

      expect(framesFromStep.length).toBe(result.frames.length);
      expect(framesFromStep.map((f) => f!.index)).toEqual(
        result.frames.map((f) => f.index),
      );
      engine1.dispose();
      engine2.dispose();
    });
  });

  describe('getCurrentFrame()', () => {
    it('returns null initially', () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      expect(engine.getCurrentFrame()).toBeNull();
      engine.dispose();
    });

    it('returns last frame after stepping', () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      engine.step();
      engine.step();
      const current = engine.getCurrentFrame();

      expect(current).not.toBeNull();
      expect(current!.index).toBe(1);
      engine.dispose();
    });
  });

  describe('getFrameAt()', () => {
    it('returns specific frame', () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      engine.step();
      engine.step();
      engine.step();

      expect(engine.getFrameAt(0)).not.toBeNull();
      expect(engine.getFrameAt(0)!.index).toBe(0);
      expect(engine.getFrameAt(2)).not.toBeNull();
      expect(engine.getFrameAt(2)!.index).toBe(2);
      engine.dispose();
    });

    it('returns null for invalid index', () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      engine.step();

      expect(engine.getFrameAt(-1)).toBeNull();
      expect(engine.getFrameAt(10)).toBeNull();
      engine.dispose();
    });
  });

  describe('state transitions', () => {
    it('tracks UI state changes', async () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      const result = await engine.run();

      expect(result.finalState.ui.footer.status).toBe('completed');
      expect(result.finalState.ui.notifications).toHaveLength(1);
      expect(result.finalState.ui.notifications[0].kind).toBe('success');
      engine.dispose();
    });
  });

  describe('dispose()', () => {
    it('cleans up resources', () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture);

      engine.step();
      engine.dispose();

      expect(() => engine.step()).toThrow('disposed');
    });
  });

  describe('replay options', () => {
    it('uses custom viewport', async () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture, {
        viewport: { cols: 120, rows: 40 },
      });

      const result = await engine.run();

      expect(result.frames[0].viewport).toEqual({ cols: 120, rows: 40 });
      engine.dispose();
    });

    it('uses custom theme', async () => {
      const fixture = makeFixture();
      const engine = new ReplayEngine(fixture, {
        theme: 'dark',
      });

      const result = await engine.run();

      expect(result.frames[0].theme).toBe('dark');
      engine.dispose();
    });
  });
});
