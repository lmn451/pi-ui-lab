// Pretty reporter - human-readable terminal output
import type { MatrixResult, MatrixResultItem } from '../matrix-runner.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatStatus(status: 'pass' | 'fail' | 'skip'): string {
  switch (status) {
    case 'pass':
      return `${GREEN}✓${RESET}`;
    case 'fail':
      return `${RED}✗${RESET}`;
    case 'skip':
      return `${YELLOW}−${RESET}`;
  }
}

function formatResultItem(item: MatrixResultItem): string {
  const status = formatStatus(item.status);
  const duration = `${DIM}${formatDuration(item.duration)}${RESET}`;
  const location = `[${item.mode.toUpperCase()}] ${item.fixture} @ ${item.width}x${item.theme}`;

  let line = `  ${status} ${location} ${duration}`;

  if (item.error) {
    line += `\n    ${RED}${item.error}${RESET}`;
  }

  return line;
}

export function reportPretty(result: MatrixResult): void {
  console.log(`\n${BOLD}Test Matrix Results${RESET}\n`);

  // Group by fixture
  const byFixture = new Map<string, MatrixResultItem[]>();
  for (const item of result.results) {
    const items = byFixture.get(item.fixture) ?? [];
    items.push(item);
    byFixture.set(item.fixture, items);
  }

  // Print results grouped by fixture
  for (const [fixture, items] of byFixture) {
    console.log(`${BOLD}${fixture}${RESET}`);
    for (const item of items) {
      console.log(formatResultItem(item));
    }
    console.log();
  }

  // Summary
  const summary = [
    `${GREEN}${result.passed} passed${RESET}`,
    `${RED}${result.failed} failed${RESET}`,
    `${YELLOW}${result.skipped} skipped${RESET}`,
  ];

  console.log(`${BOLD}Summary:${RESET} ${summary.join(', ')} (${result.total} total)\n`);
}
