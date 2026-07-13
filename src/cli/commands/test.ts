import { runTests, reportPretty, reportJson, reportJunit } from '../../runner/index.js';
import type { TestRunnerOptions } from '../../runner/test-runner.js';

export interface TestOptions {
  update?: boolean;
  matrix?: boolean;
  backend?: 'in-process' | 'pty';
  reporter?: 'pretty' | 'json' | 'junit';
  widths?: string;
  width?: string;
  themes?: string;
  theme?: string;
  shard?: string;
  shardIndex?: string;
  shardCount?: string;
  snapshotDir?: string;
  failureDir?: string;
  sutExtension?: string;
  sutModule?: string;
  sutCwd?: string;
}

function parseNumbers(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const numbers = value.split(',').map((part) => Number(part.trim()));
  if (numbers.some((number) => !Number.isInteger(number) || number < 1)) {
    throw new Error(`Invalid numeric list: ${value}`);
  }
  return numbers;
}

function parseShard(value: string | undefined): { index?: number; count?: number } {
  if (!value) return {};
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[1]) >= Number(match[2])) {
    throw new Error(`Invalid shard (expected INDEX/COUNT): ${value}`);
  }
  return { index: Number(match[1]), count: Number(match[2]) };
}

function parseOptionalInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Invalid ${name}: ${value}`);
  return parsed;
}

export async function runTest(patterns: string[], opts: TestOptions): Promise<void> {
  try {
    const shard = parseShard(opts.shard);
    const explicitIndex = parseOptionalInteger(opts.shardIndex, 'shard index');
    const explicitCount = parseOptionalInteger(opts.shardCount, 'shard count');
    if (opts.shard && (explicitIndex !== undefined || explicitCount !== undefined)) {
      throw new Error('Use either --shard or --shard-index/--shard-count');
    }
    if (Boolean(opts.sutExtension) !== Boolean(opts.sutModule)) {
      throw new Error('--sut-extension and --sut-module must be supplied together');
    }
    const options: TestRunnerOptions = {
      patterns, update: opts.update ?? false, matrix: opts.matrix ?? false,
      backend: opts.backend ?? 'in-process', reporter: opts.reporter ?? 'pretty',
      widths: parseNumbers(opts.widths ?? opts.width),
      themes: (opts.themes ?? opts.theme)?.split(',').map((theme) => theme.trim()),
      shardIndex: explicitIndex ?? shard.index, shardCount: explicitCount ?? shard.count, snapshotDir: opts.snapshotDir, failureDir: opts.failureDir,
      sut: opts.sutExtension && opts.sutModule ? {
        extensionPath: opts.sutExtension, modulePath: opts.sutModule, cwd: opts.sutCwd ?? process.cwd(),
      } : undefined,
    };
    const result = await runTests(options);
    if (options.reporter === 'json') console.log(reportJson(result));
    else if (options.reporter === 'junit') console.log(reportJunit(result));
    else reportPretty(result);
    if (result.failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
