// Standalone controller for deterministic ReplayEngine inspection.

import { writeFileSync } from 'node:fs';
import { ReplayEngine } from '../replay/replay-engine.js';
import type { Fixture, FixtureEvent, ReplayFrame, Viewport } from '../types.js';
import { InspectorRenderer } from './inspector-renderer.js';

export interface InspectorSessionOptions {
  widths?: number[];
  themes?: string[];
  availableWidths?: number[];
  availableThemes?: string[];
  viewport?: Viewport;
  theme?: string;
}

export interface InspectorSearchOptions {
  kind?: 'agent' | 'event' | 'notification';
}

export interface InspectorSearchResult {
  frame: ReplayFrame;
  event?: FixtureEvent;
  notification?: string;
}

export type InspectorExportFormat = 'text' | 'ansi' | 'svg' | 'png';

export class InspectorSession {
  private readonly fixture: Fixture;
  private readonly widths: number[];
  private readonly themes: string[];
  private readonly renderer: InspectorRenderer;
  private engine: ReplayEngine;
  private widthIndex: number;
  private themeIndex: number;
  private current: ReplayFrame | null = null;
  private playing = false;

  constructor(fixture: Fixture, options: InspectorSessionOptions = {}) {
    this.fixture = fixture;
    const widthOptions = options.widths ?? options.availableWidths;
    const themeOptions = options.themes ?? options.availableThemes;
    this.widths = normalizeWidths(widthOptions, options.viewport?.cols ?? fixture.viewport.cols);
    this.themes = normalizeThemes(themeOptions, options.theme ?? fixture.theme);
    this.widthIndex = indexOfValue(this.widths, options.viewport?.cols ?? fixture.viewport.cols);
    this.themeIndex = indexOfValue(this.themes, options.theme ?? fixture.theme);
    this.renderer = new InspectorRenderer();
    this.engine = this.createEngine();
  }

  step(): ReplayFrame | null {
    const frame = this.engine.step();
    if (frame) this.current = frame;
    return frame;
  }

  previous(): ReplayFrame | null {
    const target = (this.current?.index ?? 0) - 1;
    if (target < 0) {
      this.resetEngine();
      return null;
    }
    this.resetEngine();
    for (let index = 0; index <= target; index += 1) this.step();
    return this.current;
  }

  selectFrame(index: number): ReplayFrame | null {
    if (!Number.isInteger(index) || index < 0) return null;
    this.resetEngine();
    for (let current = 0; current <= index; current += 1) {
      if (!this.step()) return null;
    }
    return this.current;
  }

  play(): void {
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  togglePlayPause(): boolean {
    this.playing = !this.playing;
    return this.playing;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  tick(): ReplayFrame | null {
    return this.playing ? this.step() : this.current;
  }

  advance(): ReplayFrame | null {
    return this.tick();
  }

  getCurrentFrame(): ReplayFrame | null {
    return this.current;
  }

  get currentFrame(): ReplayFrame | null {
    return this.current;
  }

  getCurrentEvents(): FixtureEvent[] {
    if (!this.current) return [];
    return this.fixture.timeline.filter((event) => event.at === this.current?.timeMs);
  }

  getViewport(): Viewport {
    return { cols: this.widths[this.widthIndex], rows: this.fixture.viewport.rows };
  }

  getTheme(): string {
    return this.themes[this.themeIndex];
  }

  cycleWidth(direction = 1): Viewport {
    this.widthIndex = nextIndex(this.widthIndex, this.widths.length, direction);
    this.replayToCurrent();
    return this.getViewport();
  }

  cycleTheme(direction = 1): string {
    this.themeIndex = nextIndex(this.themeIndex, this.themes.length, direction);
    this.replayToCurrent();
    return this.getTheme();
  }

  setWidth(width: number): Viewport {
    const index = this.widths.indexOf(width);
    if (index < 0) throw new Error(`Unsupported inspector width: ${width}`);
    this.widthIndex = index;
    this.replayToCurrent();
    return this.getViewport();
  }

  setTheme(theme: string): string {
    const index = this.themes.indexOf(theme);
    if (index < 0) throw new Error(`Unsupported inspector theme: ${theme}`);
    this.themeIndex = index;
    this.replayToCurrent();
    return this.getTheme();
  }

  async jumpToTime(timeMs: number): Promise<ReplayFrame | null> {
    validateTime(timeMs);
    this.resetEngine();
    const result = await this.engine.runUntil(timeMs);
    this.current = lastFrame(result.frames);
    return this.current;
  }

  async jumpToCheckpoint(name: string): Promise<ReplayFrame | null> {
    if (!name.trim()) throw new Error('Checkpoint name must not be empty');
    this.resetEngine();
    const result = await this.engine.runToCheckpoint(name);
    if (!result.checkpoints.has(name)) throw new Error(`Checkpoint not found: ${name}`);
    this.current = lastFrame(result.frames);
    return this.current;
  }

  search(query: string, options: InspectorSearchOptions = {}): InspectorSearchResult[] {
    const selectedIndex = this.current?.index;
    this.replayAll();
    try {
      const needle = query.toLowerCase();
      const results: InspectorSearchResult[] = [];
      for (const event of this.fixture.timeline) {
        if (!matchesEvent(event, needle, options.kind)) continue;
        const frame = this.frameForEvent(event);
        if (frame) results.push({ frame, event });
      }
      if (!options.kind || options.kind === 'notification') {
        results.push(...this.searchNotificationResults(needle));
      }
      return dedupeResults(results);
    } finally {
      this.restoreSelection(selectedIndex);
    }
  }

  searchByAgent(agent: string): InspectorSearchResult[] {
    return this.search(agent, { kind: 'agent' });
  }

  searchByEvent(eventType: string): InspectorSearchResult[] {
    return this.search(eventType, { kind: 'event' });
  }

  searchNotifications(query: string): InspectorSearchResult[] {
    return this.search(query, { kind: 'notification' });
  }

  searchByNotification(query: string): InspectorSearchResult[] {
    return this.searchNotifications(query);
  }

  render(): string {
    return this.renderer.render(this.current, { events: this.getCurrentEvents() });
  }

  saveText(path: string): void {
    writeFileSync(path, this.render(), 'utf8');
  }

  saveAnsi(path: string): void {
    writeFileSync(path, this.renderer.renderAnsi(this.current), 'utf8');
  }

  saveSvg(path: string): void {
    writeFileSync(path, this.renderer.renderSvg(this.current), 'utf8');
  }

  savePng(path: string): void {
    writeFileSync(path, this.renderer.renderPng(this.current));
  }

  save(path: string, format: InspectorExportFormat = 'text'): void {
    if (format === 'text') return this.saveText(path);
    if (format === 'ansi') return this.saveAnsi(path);
    if (format === 'svg') return this.saveSvg(path);
    return this.savePng(path);
  }

  dispose(): void {
    this.engine.dispose();
    this.current = null;
    this.playing = false;
  }

  private createEngine(): ReplayEngine {
    return new ReplayEngine(this.fixture, {
      viewport: this.getViewport(),
      theme: this.getTheme(),
    });
  }

  private resetEngine(): void {
    this.engine.dispose();
    this.engine = this.createEngine();
    this.current = null;
  }

  private replayToCurrent(): void {
    const target = this.current?.index ?? -1;
    this.resetEngine();
    for (let index = 0; index <= target; index += 1) this.step();
  }

  private replayAll(): void {
    this.resetEngine();
    while (this.step() !== null) {
      // Deliberately empty: stepping is the deterministic source of frames.
    }
  }

  private restoreSelection(index: number | undefined): void {
    this.resetEngine();
    if (index === undefined) return;
    for (let current = 0; current <= index; current += 1) this.step();
  }

  private frameForEvent(event: FixtureEvent): ReplayFrame | null {
    return this.findFrameAtTime(event.at);
  }

  private findFrameAtTime(timeMs: number): ReplayFrame | null {
    const frames = this.collectFrames();
    return frames.find((frame) => frame.timeMs === timeMs)
      ?? frames.find((frame) => frame.timeMs >= timeMs)
      ?? null;
  }

  private collectFrames(): ReplayFrame[] {
    const frames: ReplayFrame[] = [];
    let frame: ReplayFrame | null;
    for (let index = 0; (frame = this.engine.getFrameAt(index)); index += 1) frames.push(frame);
    return frames;
  }

  private searchNotificationResults(needle: string): InspectorSearchResult[] {
    return this.collectFrames().flatMap((frame) => frame.ui.notifications
      .filter((notification) => notification.message.toLowerCase().includes(needle))
      .map((notification) => ({ frame, notification: notification.message })));
  }
}

function normalizeWidths(widths: number[] | undefined, fallback: number): number[] {
  const values = widths ?? [fallback, fallback === 80 ? 120 : 80];
  if (values.length === 0 || values.some((width) => !Number.isInteger(width) || width <= 0)) {
    throw new Error('Inspector widths must contain positive integers');
  }
  return [...new Set(values)];
}

function normalizeThemes(themes: string[] | undefined, fallback: string): string[] {
  const defaultTheme = fallback === 'dark' ? 'default' : 'dark';
  const values = themes ?? [fallback, defaultTheme];
  if (values.length === 0 || values.some((theme) => theme.length === 0)) {
    throw new Error('Inspector themes must not be empty');
  }
  return [...new Set(values)];
}

function indexOfValue<T>(values: T[], value: T): number {
  const index = values.indexOf(value);
  return index >= 0 ? index : 0;
}

function nextIndex(index: number, length: number, direction: number): number {
  if (length < 2) return index;
  const delta = direction < 0 ? -1 : 1;
  return (index + delta + length) % length;
}

function validateTime(timeMs: number): void {
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('Inspect time must be a non-negative number');
}

function lastFrame(frames: ReplayFrame[]): ReplayFrame | null {
  return frames.length === 0 ? null : frames[frames.length - 1];
}

function matchesEvent(event: FixtureEvent, needle: string, kind?: InspectorSearchOptions['kind']): boolean {
  const typeMatch = event.type.toLowerCase().includes(needle);
  const agentMatch = 'agentId' in event && String(event.agentId).toLowerCase().includes(needle);
  const nameMatch = event.name?.toLowerCase().includes(needle) ?? false;
  if (kind === 'agent') return Boolean(agentMatch || ('agentName' in event && event.agentName.toLowerCase().includes(needle)));
  if (kind === 'event') return typeMatch || nameMatch;
  if (kind === 'notification') return false;
  return typeMatch || Boolean(agentMatch) || nameMatch;
}

function dedupeResults(results: InspectorSearchResult[]): InspectorSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.frame.index}:${result.event?.type ?? ''}:${result.notification ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
