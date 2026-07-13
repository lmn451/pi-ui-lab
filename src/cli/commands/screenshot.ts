import { writeFile } from 'node:fs/promises';
import { FixtureLoader } from '../../fixtures/index.js';
import { captureTerminal, generatePng, renderSvg } from '../../capture/index.js';
import { ReplayEngine } from '../../replay/index.js';
import type { CellGrid, Fixture, ReplayFrame, CursorState, Viewport } from '../../types.js';

export interface ScreenshotOptions {
  at?: string | number;
  checkpoint?: string;
  format?: string;
  backend?: string;
  output?: string;
}

interface CaptureResult {
  grid: CellGrid;
  cursor: CursorState;
  viewport: Viewport;
  theme: string;
}

/** Load, replay, and render one deterministic synthetic terminal frame. */
export async function runScreenshot(
  fixturePath: string,
  opts: ScreenshotOptions = {},
): Promise<void> {
  const format = opts.format ?? 'svg';
  const backend = opts.backend ?? 'termless';
  if (!['svg', 'png'].includes(format)) {
    returnUsageError(`Unsupported screenshot format: ${format}`);
    return;
  }
  if (!['termless', 'pi-shot'].includes(backend)) {
    returnUsageError(`Unsupported screenshot backend: ${backend}`);
    return;
  }
  if (backend === 'pi-shot') {
    returnBackendUnavailable();
    return;
  }
  const at = parseTimestamp(opts.at);
  if (opts.at !== undefined && at === undefined) return;
  if (at !== undefined && opts.checkpoint) {
    returnUsageError('Use either --at or --checkpoint, not both');
    return;
  }
  let fixture: Fixture;
  try {
    fixture = await new FixtureLoader().load(fixturePath);
  } catch (error: unknown) {
    returnFixtureError(error);
    return;
  }
  const engine = new ReplayEngine(fixture, { captureTerminal: true });
  try {
    const result = opts.checkpoint
      ? await engine.runToCheckpoint(opts.checkpoint)
      : at === undefined ? await engine.run() : await engine.runUntil(at);
    if (opts.checkpoint && !result.checkpoints.has(opts.checkpoint)) {
      returnUsageError(`Unknown checkpoint: ${opts.checkpoint}`);
      return;
    }
    const checkpointIndex = opts.checkpoint
      ? result.checkpoints.get(opts.checkpoint) : undefined;
    const capture = captureFrame(fixture, selectFrame(result.frames, checkpointIndex));
    const data = format === 'png'
      ? generatePng(capture.grid, { cursor: capture.cursor, ...themeColors(capture.theme) })
      : renderSvg(capture.grid, { cursor: capture.cursor, ...themeColors(capture.theme) });
    await writeOutput(opts.output, data);
  } catch (error: unknown) {
    console.error(`Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 4;
  } finally {
    engine.dispose();
  }
}

function parseTimestamp(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    returnUsageError(`Invalid screenshot timestamp: ${String(value)}`);
    return undefined;
  }
  return parsed;
}

function selectFrame(frames: ReplayFrame[], checkpointIndex: number | undefined): ReplayFrame | undefined {
  if (frames.length === 0) return undefined;
  if (checkpointIndex === undefined) return frames[frames.length - 1];
  return frames[Math.min(Math.max(checkpointIndex, 0), frames.length - 1)];
}

function captureFrame(fixture: Fixture, frame: ReplayFrame | undefined): CaptureResult {
  const viewport = frame?.viewport ?? fixture.viewport;
  const theme = frame?.theme ?? fixture.theme;
  if (frame?.terminal?.cells && frame.terminal.cells.length > 0) {
    return { grid: frame.terminal.cells, cursor: frame.terminal.cursor, viewport, theme };
  }
  const captured = captureTerminal(renderSummary(fixture.name, frame).join('\n'), viewport);
  return { grid: captured.cells, cursor: captured.cursor, viewport, theme };
}

function renderSummary(fixtureName: string, frame: ReplayFrame | undefined): string[] {
  if (!frame) return [`Fixture: ${fixtureName}`, 'Status: stale', 'Active agents: 0', 'Notifications: 0'];
  const { footer, notifications, widgets, toolRenders } = frame.ui;
  const lines = [`Fixture: ${fixtureName}`, `Time: ${frame.timeMs}ms`, `Status: ${footer.status}`,
    `Active agents: ${footer.activeAgents}`, `Notifications: ${notifications.length}`,
    `Cursors: ${Object.keys(frame.recovery.cursors).length}`, `Artifacts: ${frame.recovery.artifactEvents.length}`];
  for (const widget of widgets) {
    if (widget.visible) lines.push(`${widget.label}:`, ...widget.rows);
  }
  for (const notification of notifications) lines.push(`${notification.kind}: ${notification.message}`);
  for (const render of toolRenders) lines.push(`${render.toolName}: ${render.content}`);
  return lines;
}

function themeColors(theme: string): { foreground: string; background: string } {
  return /light/i.test(theme) ? { foreground: '#000000', background: '#ffffff' }
    : { foreground: '#ffffff', background: '#000000' };
}

async function writeOutput(path: string | undefined, data: string | Uint8Array): Promise<void> {
  if (path) {
    await writeFile(path, data);
    console.log(`Written to ${path}`);
    return;
  }
  if (typeof data === 'string') process.stdout.write(data);
  else process.stdout.write(Buffer.from(data));
}

function returnFixtureError(error: unknown): void {
  console.error(`Failed to load fixture: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}

function returnUsageError(message: string): void {
  console.error(`Error: ${message}`);
  process.exitCode = 2;
}

function returnBackendUnavailable(): void {
  console.error('Screenshot backend unavailable: pi-shot is not installed');
  process.exitCode = 3;
}
