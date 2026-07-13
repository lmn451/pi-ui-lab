import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { visibleWidth } from '@earendil-works/pi-tui';
import { InspectorComponent, InspectorSession } from '../inspector/index.js';
import type { Fixture } from '../types.js';

function fixture(): Fixture {
  return {
    version: 1, name: 'component', viewport: { cols: 80, rows: 24 }, theme: 'default', pollIntervalMs: 10,
    timeline: [
      { at: 10, type: 'session_start' },
      { at: 20, type: 'checkpoint', name: 'ready' },
      { at: 30, type: 'done', agentId: 'worker', content: 'complete' },
    ],
  };
}

function createComponent(outputDir = tmpdir()): { component: InspectorComponent; session: InspectorSession; close: ReturnType<typeof vi.fn> } {
  const session = new InspectorSession(fixture(), { widths: [80, 120], themes: ['default', 'dark'] });
  const close = vi.fn();
  return { component: new InspectorComponent(session, { tui: { requestRender: vi.fn() }, outputDir, onClose: close, playIntervalMs: 5 }), session, close };
}

describe('InspectorComponent', () => {
  it('handles navigation, playback cleanup, width, theme, jump, search, and close', async () => {
    vi.useFakeTimers();
    const { component, session, close } = createComponent();
    try {
      component.handleInput('n');
      expect(session.currentFrame?.index).toBe(0);
      component.handleInput('b');
      expect(session.currentFrame).toBeNull();
      component.handleInput(' ');
      vi.advanceTimersByTime(5);
      expect(session.currentFrame?.index).toBe(0);
      component.handleInput(' ');
      vi.advanceTimersByTime(20);
      expect(session.currentFrame?.index).toBe(0);
      component.handleInput('w');
      component.handleInput('t');
      expect(session.getViewport().cols).toBe(120);
      expect(session.getTheme()).toBe('dark');
      component.handleInput('j');
      for (const key of '10') component.handleInput(key);
      component.handleInput('\r');
      await vi.runAllTimersAsync();
      expect(session.currentFrame?.timeMs).toBe(10);
      component.handleInput('j');
      for (const key of 'checkpoint:ready') component.handleInput(key);
      component.handleInput('\r');
      await vi.runAllTimersAsync();
      expect(session.currentFrame?.timeMs).toBe(20);
      component.handleInput('/');
      for (const key of 'complete') component.handleInput(key);
      component.handleInput('\r');
      await Promise.resolve();
      expect(session.currentFrame?.timeMs).toBe(30);
      component.handleInput('q');
      expect(close).toHaveBeenCalledOnce();
    } finally {
      component.dispose();
      session.dispose();
      vi.useRealTimers();
    }
  });

  it('saves SVG and PNG and never emits a line wider than its viewport', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pi-ui-lab-component-'));
    const { component, session } = createComponent(directory);
    try {
      component.handleInput('n');
      component.handleInput('g');
      component.handleInput('i');
      expect(existsSync(join(directory, 'inspector-frame-0.svg'))).toBe(true);
      expect(existsSync(join(directory, 'inspector-frame-0.png'))).toBe(true);
      expect(component.render(24).every((line) => visibleWidth(line) <= 24)).toBe(true);
    } finally {
      component.dispose();
      session.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
