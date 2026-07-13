// Deterministic, dependency-free inspector panel renderer.

import type { CellGrid, FixtureEvent, ReplayFrame } from '../types.js';
import { captureTerminal } from '../capture/terminal-capture.js';
import { renderSvg as gridToSvg } from '../capture/svg-renderer.js';
import { renderPng as gridToPng } from '../capture/png-adapter.js';

export interface InspectorRenderOptions {
  events?: FixtureEvent[];
}

export class InspectorRenderer {
  render(frame: ReplayFrame | null, options: InspectorRenderOptions = {}): string {
    if (!frame) return 'Inspector\nNo frame selected.\n';

    const lines = [
      'Inspector',
      `Frame: #${frame.index}  Time: ${frame.timeMs}ms  Cause: ${frame.cause}`,
      `Viewport: ${frame.viewport.cols}x${frame.viewport.rows}  Theme: ${frame.theme}`,
      this.renderEvents(options.events ?? []),
      'UI state:',
      `  Footer: status=${frame.ui.footer.status} activeAgents=${frame.ui.footer.activeAgents}`,
      `  Widgets: ${frame.ui.widgets.length}`,
      `  Notifications: ${frame.ui.notifications.length}`,
      `  Tool renders: ${frame.ui.toolRenders.length}`,
      'Recovery:',
      `  Cursors: ${formatRecord(frame.recovery.cursors)}`,
      `  Processed receipts: ${formatList(frame.recovery.processedReceipts)}`,
      `  Artifacts: ${frame.recovery.artifactEvents.length}`,
      renderTerminal(frame),
    ];
    return lines.join('\n') + '\n';
  }

  renderFrame(frame: ReplayFrame | null, events: FixtureEvent[] = []): string {
    return this.render(frame, { events });
  }

  renderAnsi(frame: ReplayFrame | null, events: FixtureEvent[] = []): string {
    if (frame?.terminal?.ansi !== undefined) return frame.terminal.ansi;
    return this.render(frame, { events });
  }

  renderSvg(frame: ReplayFrame | null): string {
    return gridToSvg(this.imageGrid(frame), { cursor: frame?.terminal?.cursor });
  }

  renderPng(frame: ReplayFrame | null): Uint8Array {
    return gridToPng(this.imageGrid(frame), { cursor: frame?.terminal?.cursor });
  }

  private imageGrid(frame: ReplayFrame | null): CellGrid {
    if (frame?.terminal?.cells.length) return frame.terminal.cells;
    const viewport = frame?.viewport ?? { cols: 80, rows: 24 };
    return captureTerminal(this.render(frame), viewport).cells;
  }

  private renderEvents(events: FixtureEvent[]): string {
    if (events.length === 0) return 'Events: none';
    const entries = events.map((event) => {
      const label = event.name ? ` (${event.name})` : '';
      return `  - [${event.at}ms] ${event.type}${label}`;
    });
    return ['Events:', ...entries].join('\n');
  }
}

function formatRecord(record: Record<string, unknown>): string {
  const entries = Object.entries(record);
  return entries.length === 0 ? 'none' : JSON.stringify(record);
}

function formatList(values: string[]): string {
  return values.length === 0 ? 'none' : values.join(', ');
}

function renderTerminal(frame: ReplayFrame): string {
  if (!frame.terminal) return 'Terminal: unavailable';
  const { cursor, overflow, text } = frame.terminal;
  const lineCount = text.length === 0 ? 0 : text.split('\n').length;
  return [
    'Terminal:',
    `  Lines: ${lineCount} Cursor: ${cursor.row},${cursor.col} visible=${cursor.visible}`,
    `  Overflow: horizontal=${overflow.horizontal} vertical=${overflow.vertical} clipped=${overflow.clippedCells} scrollback=${overflow.scrollbackLines} wrap=${overflow.unexpectedWrap}`,
  ].join('\n');
}

export function renderInspectorFrame(
  frame: ReplayFrame | null,
  events: FixtureEvent[] = [],
): string {
  return new InspectorRenderer().renderFrame(frame, events);
}
