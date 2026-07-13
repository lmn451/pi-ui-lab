import { writeFileSync } from 'node:fs';
import { FixtureLoader } from '../../fixtures/index.js';
import {
  ReplayEngine,
  buildSnapshotMetadata,
  hashFixture,
  produceTextSnapshot,
  serializeSnapshot,
} from '../../replay/index.js';
import type { Fixture, ReplayFrame } from '../../types.js';
import { readFile } from 'node:fs/promises';

export interface ReplayOptions {
  format: 'text' | 'ansi' | 'json';
  at?: number;
  checkpoint?: string;
  cols?: number;
  rows?: number;
  theme?: string;
  output?: string;
}

export async function runReplay(
  fixturePath: string,
  opts: ReplayOptions,
): Promise<void> {
  let fixture: Fixture;
  let source: string;
  try {
    source = await readFile(fixturePath, 'utf-8');
    fixture = await new FixtureLoader().loadFromString(source, fixturePath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to load fixture: ${message}`);
    process.exit(2);
  }

  const viewport = {
    cols: opts.cols ?? fixture.viewport.cols,
    rows: opts.rows ?? fixture.viewport.rows,
  };
  const engine = new ReplayEngine(fixture, {
    viewport,
    theme: opts.theme,
    captureTerminal: opts.format === 'ansi',
  });

  const result = opts.checkpoint
    ? await engine.runToCheckpoint(opts.checkpoint)
    : opts.at === undefined
      ? await engine.run()
      : await engine.runUntil(opts.at);
  const output = formatReplay(result.frames, fixture, source, viewport, opts);
  engine.dispose();

  if (opts.output) {
    writeFileSync(opts.output, output, 'utf-8');
    console.log(`Written to ${opts.output}`);
    return;
  }
  process.stdout.write(output);
}

function formatReplay(
  frames: ReplayFrame[],
  fixture: Fixture,
  source: string,
  viewport: { cols: number; rows: number },
  opts: ReplayOptions,
): string {
  if (opts.format === 'json') {
    const metadata = buildSnapshotMetadata(
      fixture.name,
      hashFixture(source),
      viewport,
      opts.theme ?? fixture.theme,
    );
    return serializeSnapshot(produceTextSnapshot(frames, metadata)) + '\n';
  }

  const header = [
    `Fixture:  ${fixture.name}`,
    `Viewport: ${viewport.cols}×${viewport.rows}`,
    `Theme:    ${opts.theme ?? fixture.theme}`,
    `Frames:   ${frames.length}`,
    `Events:   ${fixture.timeline.length}`,
    '',
  ];
  return header.concat(frames.map(formatFrame)).join('\n') + '\n';
}

function formatFrame(frame: ReplayFrame): string {
  const { footer, notifications } = frame.ui;
  return [
    `[${String(frame.timeMs).padStart(6)}ms] frame=${frame.index} cause=${frame.cause}`,
    `  status=${footer.status} activeAgents=${footer.activeAgents}`,
    `  notifications=${notifications.length} cursors=${Object.keys(frame.recovery.cursors).length}`,
  ].join('\n');
}
