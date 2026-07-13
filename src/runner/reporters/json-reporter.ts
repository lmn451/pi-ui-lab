// JSON reporter - machine-readable output
import type { MatrixResult } from '../matrix-runner.js';

export interface JsonReport {
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  results: Array<{
    fixture: string;
    width: number;
    theme: string;
    status: 'pass' | 'fail' | 'skip';
    duration: number;
    error?: string;
  }>;
}

export function reportJson(result: MatrixResult): string {

  const totalDuration = result.results.reduce((sum, r) => sum + r.duration, 0);

  const report: JsonReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      duration: totalDuration,
    },
    results: result.results.map((r) => ({
      fixture: r.fixture,
      width: r.width,
      theme: r.theme,
      status: r.status,
      duration: r.duration,
      error: r.error,
    })),
  };

  return JSON.stringify(report, null, 2);
}
