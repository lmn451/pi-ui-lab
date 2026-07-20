#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { runReplay } from './commands/replay.js';
import { runScreenshot } from './commands/screenshot.js';
import { runTest } from './commands/test.js';
import { runInspect } from './commands/inspect.js';
import { runImport } from './commands/import.js';
import { runDoctor } from './commands/doctor.js';

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { version: string; description: string };

const program = new Command();

program
  .name('pi-ui-lab')
  .version(pkg.version)
  .description(pkg.description)
  .option('--verbose', 'enable verbose output');

program
  .command('replay <fixture>')
  .description('Replay a fixture file')
  .option('--format <format>', 'output format', 'text')
  .option('--at <ms>', 'replay up to timestamp (ms)')
  .option('--checkpoint <name>', 'replay up to a named checkpoint')
  .option('--cols <n>', 'viewport columns')
  .option('--rows <n>', 'viewport rows')
  .option('--theme <name>', 'theme name')
  .option('--output <path>', 'write output to file')
  .action(async (fixture: string, opts: Record<string, string>) => {
    try {
      await runReplay(fixture, {
        format: parseReplayFormat(opts.format),
        at: opts.at ? parseNonNegativeNumber(opts.at, '--at') : undefined,
        checkpoint: opts.checkpoint,
        cols: opts.cols ? parsePositiveInteger(opts.cols, '--cols') : undefined,
        rows: opts.rows ? parsePositiveInteger(opts.rows, '--rows') : undefined,
        theme: opts.theme,
        output: opts.output,
      });
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(4);
    }
  });

program
  .command('screenshot <fixture>')
  .description('Capture a deterministic screenshot of a fixture')
  .option('--at <ms>', 'timestamp to capture')
  .option('--checkpoint <name>', 'capture at a named checkpoint')
  .option('--format <format>', 'output format (svg or png)', 'svg')
  .option('--backend <backend>', 'capture backend (termless or pi-shot)', 'termless')
  .option('--output <path>', 'save screenshot to file')
  .action(async (fixture: string, opts: Record<string, string>) => {
    await runScreenshot(fixture, opts);
  });

program
  .command('test [patterns...]')
  .description('Run fixture tests')
  .option('--update', 'update snapshots')
  .option('--matrix', 'run across viewport matrix')
  .option('--widths <list>', 'comma-separated viewport widths')
  .option('--width <n>', 'single viewport width')
  .option('--themes <list>', 'comma-separated themes')
  .option('--theme <name>', 'single theme')
  .option('--shard <index/count>', 'run one matrix shard')
  .option('--shard-index <n>', 'matrix shard index')
  .option('--shard-count <n>', 'matrix shard count')
  .option('--snapshot-dir <path>', 'snapshot store base directory')
  .option('--failure-dir <path>', 'failure artifact directory')
  .option('--sut-extension <path>', 'external production extension entry path')
  .option('--sut-module <path>', 'external production module path')
  .option('--sut-cwd <path>', 'external SUT sandbox cwd')
  .option('--mode <mode>', 'execution mode (model, sut, or pty)')
  .option('--backend <backend>', 'deprecated transport override (in-process or pty)')
  .option('--reporter <reporter>', 'test reporter (pretty, json, junit)', 'pretty')
  .action(async (patterns: string[], opts: Record<string, string>) => {
    await runTest(patterns, {
      update: opts.update === undefined ? undefined : Boolean(opts.update),
      matrix: opts.matrix === undefined ? undefined : Boolean(opts.matrix),
      widths: opts.widths, width: opts.width, themes: opts.themes, theme: opts.theme,
      shard: opts.shard, shardIndex: opts.shardIndex, shardCount: opts.shardCount,
      snapshotDir: opts.snapshotDir, failureDir: opts.failureDir,
      sutExtension: opts.sutExtension, sutModule: opts.sutModule, sutCwd: opts.sutCwd,
      mode: opts.mode as 'model' | 'sut' | 'pty',
      backend: opts.backend as 'in-process' | 'pty',
      reporter: opts.reporter as 'pretty' | 'json' | 'junit',
    });
  });

program
  .command('inspect <fixture>')
  .description('Open fixture in interactive inspector')
  .option('--at <ms>', 'starting timestamp')
  .option('--checkpoint <name>', 'jump to a named checkpoint')
  .option('--non-interactive', 'print deterministic output even in a TTY')
  .action(async (fixture: string, opts: Record<string, string>) => {
    try {
      await runInspect(fixture, opts);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exitCode = 2;
    }
  });

const fixtureCommand = program
  .command('fixture')
  .description('Manage fixtures');
fixtureCommand
  .command('import')
  .description('Import fixtures from session recordings')
  .argument('[sources...]', 'paths or session directories')
  .option('--session <path>', 'session JSONL file')
  .option('--events <path>', 'events NDJSON file')
  .option('--state <path>', 'state JSON file')
  .option('--artifacts <directory>', 'artifacts directory')
  .option('--output <directory>', 'output fixture directory')
  .action(async (sources: string[], opts: Record<string, string>) => {
    try {
      const exitCode = await runImport(sources, opts);
      process.exitCode = exitCode;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exitCode = 2;
    }
  });

program
  .command('doctor')
  .description('Check system dependencies')
  .option('--require <capability>', 'require compatible pi or operational pty')
  .action(async (opts: { require?: string }) => {
    try {
      await runDoctor(opts.require);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exitCode = 2;
    }
  });

function parseReplayFormat(value: string | undefined): 'text' | 'ansi' | 'json' {
  const format = value ?? 'text';
  if (format !== 'text' && format !== 'ansi' && format !== 'json') {
    throw new Error(`Invalid replay format: ${format}`);
  }
  return format;
}

function parseNonNegativeNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${option} must be a non-negative number`);
  return parsed;
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${option} must be a positive integer`);
  return parsed;
}

program.parse();
