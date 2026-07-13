import { importFixture, type FixtureImportOptions } from '../../fixtures/index.js';

export async function runImport(
  args: string[],
  opts: Record<string, unknown>,
): Promise<number> {
  const options = buildImportOptions(args, opts);
  const result = await importFixture(options);
  console.log(`Imported ${result.fixture.timeline.length} events into ${result.fixturePath}`);
  return 0;
}

function buildImportOptions(args: string[], opts: Record<string, unknown>): FixtureImportOptions {
  const sources = args.map(String);
  const session = stringOption(opts.session) ?? sourceByExtension(sources, ['.jsonl']);
  const events = stringOption(opts.events) ?? sourceByExtension(sources, ['.ndjson']);
  const state = stringOption(opts.state);
  const artifacts = stringOption(opts.artifacts) ?? sourceDirectory(sources);
  const output = stringOption(opts.output);
  if (!output) throw new Error('Missing required option --output <directory>');
  if (!session && !events && !state && !artifacts && sources.length > 0) {
    throw new Error(`Could not determine input type for ${sources[0]}; use --session, --events, --state, or --artifacts`);
  }
  return { session, events, state, artifacts, output };
}

function stringOption(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sourceByExtension(sources: string[], extensions: string[]): string | undefined {
  return sources.find((source) => extensions.includes(source.toLowerCase().slice(source.lastIndexOf('.'))));
}

function sourceDirectory(sources: string[]): string | undefined {
  return sources.find((source) => !source.includes('.'));
}
