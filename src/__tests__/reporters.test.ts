import { describe, it, expect } from 'vitest';
import { reportPretty } from '../runner/reporters/pretty-reporter.js';
import { reportJson } from '../runner/reporters/json-reporter.js';
import { reportJunit } from '../runner/reporters/junit-reporter.js';
import type { MatrixResult } from '../runner/matrix-runner.js';

const mockResult: MatrixResult = {
  total: 3,
  passed: 2,
  failed: 1,
  skipped: 0,
  results: [
    { mode: 'model', fixture: 'test-a', width: 80, theme: 'dark', status: 'pass', duration: 100 },
    { mode: 'model', fixture: 'test-a', width: 80, theme: 'light', status: 'pass', duration: 90 },
    { mode: 'model', fixture: 'test-b', width: 80, theme: 'dark', status: 'fail', duration: 110, error: 'Snapshot mismatch' },
  ],
};

describe('Reporters', () => {
  describe('Pretty Reporter', () => {
    it('outputs without crashing', () => {
      const consoleSpy = { output: '' };
      const originalLog = console.log;
      console.log = (msg: string) => { consoleSpy.output += msg + '\n'; };

      reportPretty(mockResult);

      console.log = originalLog;

      expect(consoleSpy.output).toContain('test-a');
      expect(consoleSpy.output).toContain('test-b');
      expect(consoleSpy.output).toContain('2 passed');
      expect(consoleSpy.output).toContain('1 failed');
    });

    it('includes error messages for failures', () => {
      const lines: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };

      reportPretty(mockResult);

      console.log = originalLog;

      const errorLine = lines.find((l) => l.includes('Snapshot mismatch'));
      expect(errorLine).toBeDefined();
    });
  });

  describe('JSON Reporter', () => {
    it('returns valid JSON', () => {
      const output = reportJson(mockResult);
      const parsed = JSON.parse(output);

      expect(parsed).toBeDefined();
      expect(parsed.summary.total).toBe(3);
      expect(parsed.summary.passed).toBe(2);
      expect(parsed.summary.failed).toBe(1);
    });

    it('includes timestamp', () => {
      const output = reportJson(mockResult);
      const parsed = JSON.parse(output);

      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();
    });

    it('includes all results', () => {
      const output = reportJson(mockResult);
      const parsed = JSON.parse(output);

      expect(parsed.results).toHaveLength(3);
      expect(parsed.results[0].fixture).toBe('test-a');
      expect(parsed.results[2].status).toBe('fail');
    });
  });

  describe('JUnit Reporter', () => {
    it('returns well-formed XML', () => {
      const output = reportJunit(mockResult);

      expect(output).toContain('<?xml version="1.0"');
      expect(output).toContain('<testsuites>');
      expect(output).toContain('</testsuites>');
      expect(output).toContain('<testsuite');
      expect(output).toContain('<testcase');
    });

    it('includes test counts', () => {
      const output = reportJunit(mockResult);

      expect(output).toContain('tests="3"');
      expect(output).toContain('failures="1"');
      expect(output).toContain('skipped="0"');
    });

    it('includes failure element for failed tests', () => {
      const output = reportJunit(mockResult);

      expect(output).toContain('<failure');
      expect(output).toContain('Snapshot mismatch');
    });

    it('escapes XML special characters', () => {
      const resultWithSpecialChars: MatrixResult = {
        ...mockResult,
        results: [
          { mode: 'model', fixture: 'test', width: 80, theme: 'dark', status: 'fail', duration: 0, error: 'A < B & C > D' },
        ],
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
      };

      const output = reportJunit(resultWithSpecialChars);

      expect(output).toContain('A &lt; B &amp; C &gt; D');
      expect(output).not.toContain('A < B');
    });
  });
});
