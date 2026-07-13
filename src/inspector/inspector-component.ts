import { join } from 'node:path';
import { Key, matchesKey, truncateToWidth, type Component } from '@earendil-works/pi-tui';
import { InspectorSession } from './inspector-session.js';

export interface InspectorTuiLike {
  requestRender(force?: boolean): void;
}

export interface InspectorComponentOptions {
  tui?: InspectorTuiLike;
  outputDir?: string;
  onClose?: () => void;
  playIntervalMs?: number;
}

type PromptKind = 'jump' | 'search' | null;

/** Shared Pi and standalone keyboard controller for an InspectorSession. */
export class InspectorComponent implements Component {
  private readonly outputDir: string;
  private readonly onClose?: () => void;
  private readonly tui?: InspectorTuiLike;
  private readonly playIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private prompt: PromptKind = null;
  private input = '';
  private status = 'Ready';
  private closed = false;

  constructor(private readonly session: InspectorSession, options: InspectorComponentOptions = {}) {
    this.tui = options.tui;
    this.outputDir = options.outputDir ?? process.cwd();
    this.onClose = options.onClose;
    this.playIntervalMs = options.playIntervalMs ?? 250;
  }

  render(width: number): string[] {
    const lines = [this.header(), this.controls(), ...this.panelLines()];
    if (this.prompt) lines.push(`${this.prompt}: ${this.input}`);
    lines.push(`Status: ${this.status}`);
    return lines.map((line) => truncateToWidth(line, Math.max(1, width)));
  }

  handleInput(data: string): void {
    if (this.closed) return;
    if (this.prompt) return this.handlePrompt(data);
    if (matchesKey(data, Key.escape) || matchesKey(data, 'q')) return this.close();
    if (matchesKey(data, Key.right) || matchesKey(data, 'n')) return this.step();
    if (matchesKey(data, Key.left) || matchesKey(data, 'b')) return this.previous();
    if (matchesKey(data, Key.space)) return this.togglePlayback();
    if (matchesKey(data, 'w')) return this.cycleWidth();
    if (matchesKey(data, 't')) return this.cycleTheme();
    if (matchesKey(data, 'j')) return this.openPrompt('jump');
    if (matchesKey(data, Key.slash)) return this.openPrompt('search');
    if (matchesKey(data, 'g')) return this.save('svg');
    if (matchesKey(data, 'i')) this.save('png');
  }

  invalidate(): void {
    this.tui?.requestRender();
  }

  dispose(): void {
    this.stopTimer();
  }

  private header(): string {
    const frame = this.session.getCurrentFrame();
    const position = frame ? `#${frame.index} ${frame.timeMs}ms` : 'start';
    return `Inspector | ${position} | ${this.session.isPlaying() ? 'playing' : 'paused'}`;
  }

  private controls(): string {
    return '←/b prev  →/n next  space play  w width  t theme  j jump  / search  g SVG  i PNG  q close';
  }

  private panelLines(): string[] {
    const lines = this.session.render().trimEnd().split('\n');
    return lines.filter((line) => line !== 'Inspector');
  }

  private handlePrompt(data: string): void {
    if (matchesKey(data, Key.escape)) return this.cancelPrompt();
    if (matchesKey(data, Key.backspace)) {
      this.input = this.input.slice(0, -1);
      return this.invalidate();
    }
    if (matchesKey(data, Key.enter)) return void this.submitPrompt();
    if (data.length === 1 && data >= ' ') {
      this.input += data;
      this.invalidate();
    }
  }

  private async submitPrompt(): Promise<void> {
    const value = this.input.trim();
    const prompt = this.prompt;
    this.prompt = null;
    this.input = '';
    try {
      if (prompt === 'jump') await this.jump(value);
      if (prompt === 'search') this.search(value);
    } catch (error) {
      this.status = error instanceof Error ? error.message : String(error);
    }
    this.invalidate();
  }

  private async jump(value: string): Promise<void> {
    if (value.startsWith('checkpoint:')) await this.session.jumpToCheckpoint(value.slice(11).trim());
    else await this.session.jumpToTime(Number(value));
    this.status = `Jumped to ${value}`;
  }

  private search(query: string): void {
    const result = this.session.search(query);
    const frame = result[0]?.frame;
    if (frame) this.selectFrame(frame.index);
    this.status = `${result.length} result${result.length === 1 ? '' : 's'} for “${query}”`;
  }

  private selectFrame(target: number): void {
    this.session.selectFrame(target);
  }

  private step(): void {
    const frame = this.session.step();
    if (!frame) this.stopPlayback('End of timeline');
    else this.status = `Frame #${frame.index}`;
    this.invalidate();
  }

  private previous(): void {
    const frame = this.session.previous();
    this.status = frame ? `Frame #${frame.index}` : 'Start of timeline';
    this.invalidate();
  }

  private togglePlayback(): void {
    if (this.session.togglePlayPause()) this.startTimer();
    else this.stopTimer();
    this.status = this.session.isPlaying() ? 'Playing' : 'Paused';
    this.invalidate();
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => this.step(), this.playIntervalMs);
  }

  private stopPlayback(status: string): void {
    this.session.pause();
    this.stopTimer();
    this.status = status;
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private cycleWidth(): void {
    this.session.cycleWidth();
    this.status = `Viewport width: ${this.session.getViewport().cols}`;
    this.invalidate();
  }

  private cycleTheme(): void {
    this.session.cycleTheme();
    this.status = `Theme: ${this.session.getTheme()}`;
    this.invalidate();
  }

  private openPrompt(kind: PromptKind): void {
    this.prompt = kind;
    this.input = '';
    this.status = kind === 'jump' ? 'Enter milliseconds or checkpoint:name' : 'Search agent, event, or notification';
    this.invalidate();
  }

  private cancelPrompt(): void {
    this.prompt = null;
    this.input = '';
    this.status = 'Cancelled';
    this.invalidate();
  }

  private save(format: 'svg' | 'png'): void {
    const index = this.session.getCurrentFrame()?.index ?? 0;
    const path = join(this.outputDir, `inspector-frame-${index}.${format}`);
    this.session.save(path, format);
    this.status = `Saved ${path}`;
    this.invalidate();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopTimer();
    this.onClose?.();
  }
}
