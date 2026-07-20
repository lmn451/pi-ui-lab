// JUnit reporter - XML output for CI systems
import type { MatrixResult } from '../matrix-runner.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(3);
}

export function reportJunit(result: MatrixResult): string {
  const totalTime = result.results.reduce((sum, r) => sum + r.duration, 0);

  const testcases = result.results
    .map((r) => {
      const name = `[${r.mode.toUpperCase()}] ${r.fixture} @ ${r.width}x${r.theme}`;
      const time = formatTime(r.duration);

      if (r.status === 'pass') {
        return `    <testcase name="${escapeXml(name)}" time="${time}" />`;
      }

      if (r.status === 'skip') {
        return `    <testcase name="${escapeXml(name)}" time="${time}">
      <skipped />
    </testcase>`;
      }

      // fail
      const message = escapeXml(r.error ?? 'Test failed');
      return `    <testcase name="${escapeXml(name)}" time="${time}">
      <failure message="${message}">${message}</failure>
    </testcase>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="pi-ui-lab" tests="${result.total}" failures="${result.failed}" skipped="${result.skipped}" time="${formatTime(totalTime)}">
${testcases}
  </testsuite>
</testsuites>
`;
}
