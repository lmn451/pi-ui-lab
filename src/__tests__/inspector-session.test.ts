import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InspectorSession } from '../inspector/index.js';
import type { Fixture } from '../types.js';

function fixture(): Fixture {
  return {
    version: 1,
    name: 'inspector-fixture',
    viewport: { cols: 80, rows: 24 },
    theme: 'default',
    pollIntervalMs: 10_000,
    timeline: [
      { at: 100, type: 'session_start' },
      { at: 200, type: 'subagent_started', agentId: 'a1', agentName: 'worker' },
      { at: 300, type: 'checkpoint', name: 'middle' },
      { at: 400, type: 'done', agentId: 'a1', content: 'finished' },
    ],
  };
}

describe('InspectorSession', () => {
  it('steps frames and tracks play/pause state', () => {
    const session = new InspectorSession(fixture());
    expect(session.getCurrentFrame()).toBeNull();
    expect(session.step()?.timeMs).toBe(100);
    session.play();
    expect(session.isPlaying()).toBe(true);
    expect(session.tick()?.timeMs).toBe(200);
    session.pause();
    expect(session.tick()?.timeMs).toBe(200);
    expect(session.isPlaying()).toBe(false);
  });

  it('jumps to time and checkpoint', async () => {
    const session = new InspectorSession(fixture());
    expect((await session.jumpToTime(250))?.timeMs).toBe(200);
    expect((await session.jumpToCheckpoint('middle'))?.timeMs).toBe(300);
    await expect(session.jumpToCheckpoint('missing')).rejects.toThrow('Checkpoint not found');
  });

  it('searches agents, events, and notifications', () => {
    const session = new InspectorSession(fixture());
    expect(session.searchByAgent('a1')).toHaveLength(2);
    expect(session.searchByEvent('checkpoint')[0].event?.name).toBe('middle');
    expect(session.searchNotifications('finished')).toHaveLength(1);
  });

  it('cycles configured widths and themes', () => {
    const session = new InspectorSession(fixture(), {
      widths: [80, 120],
      themes: ['default', 'dark'],
    });
    expect(session.cycleWidth().cols).toBe(120);
    expect(session.cycleTheme()).toBe('dark');
    session.step();
    expect(session.currentFrame?.viewport.cols).toBe(120);
    expect(session.currentFrame?.theme).toBe('dark');
  });

  it('saves deterministic SVG and PNG images', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pi-ui-lab-inspector-'));
    const session = new InspectorSession(fixture());
    try {
      session.step();
      const svgPath = join(directory, 'frame.svg');
      const pngPath = join(directory, 'frame.png');
      session.saveSvg(svgPath);
      session.savePng(pngPath);
      expect(readFileSync(svgPath, 'utf8')).toMatch(/^<svg/);
      expect(readFileSync(pngPath).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    } finally {
      session.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
