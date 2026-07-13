import { FixtureLoader } from '../../fixtures/index.js';
import { InspectorSession, runStandaloneInspector } from '../../inspector/index.js';
import type { Fixture } from '../../types.js';

export interface InspectOptions {
  at?: string | number;
  checkpoint?: string;
  nonInteractive?: boolean;
}

export async function runInspect(
  fixturePath: string,
  opts: InspectOptions = {},
): Promise<void> {
  const fixture = await loadFixture(fixturePath);
  const at = parseInspectTime(opts.at);
  if (at !== undefined && opts.checkpoint) {
    throw new Error('Use either --at or --checkpoint, not both');
  }

  const session = new InspectorSession(fixture);
  try {
    if (opts.checkpoint) {
      await session.jumpToCheckpoint(opts.checkpoint);
    } else if (at !== undefined) {
      await session.jumpToTime(at);
    } else {
      session.step();
    }
    if (isInteractive(opts)) await runStandaloneInspector(session);
    else printInspectSummary(fixture, session);
  } finally {
    session.dispose();
  }
}

async function loadFixture(path: string): Promise<Fixture> {
  try {
    return await new FixtureLoader().load(path);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load fixture: ${message}`);
  }
}

function parseInspectTime(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid inspect time: ${String(value)}`);
  }
  return parsed;
}

function isInteractive(opts: InspectOptions): boolean {
  return !opts.nonInteractive && Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function printInspectSummary(fixture: Fixture, session: InspectorSession): void {
  const frame = session.getCurrentFrame();
  console.log(`Fixture: ${fixture.name}`);
  console.log(`Frames: ${frame ? frame.index + 1 : 0}`);
  console.log(session.render());
}
