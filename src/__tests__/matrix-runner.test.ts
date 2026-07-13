import { describe, it, expect } from 'vitest';
import { expandMatrix, type MatrixConfig } from '../runner/matrix-runner.js';

describe('MatrixRunner', () => {
  describe('expandMatrix', () => {
    it('generates correct number of combinations', () => {
      const config: MatrixConfig = {
        widths: [60, 80],
        themes: ['dark', 'light'],
        fixtures: ['fixture1.json', 'fixture2.json'],
        backend: 'in-process',
      };

      const combinations = expandMatrix(config);
      expect(combinations).toHaveLength(8); // 2 fixtures × 2 widths × 2 themes
    });

    it('uses default values when arrays are empty', () => {
      const config: MatrixConfig = {
        widths: [],
        themes: [],
        fixtures: ['test.json'],
        backend: 'in-process',
      };

      const combinations = expandMatrix(config);
      // 1 fixture × 5 default widths × 2 default themes = 10
      expect(combinations).toHaveLength(10);
    });

    it('creates all expected combinations', () => {
      const config: MatrixConfig = {
        widths: [80],
        themes: ['dark'],
        fixtures: ['test.json'],
        backend: 'in-process',
      };

      const combinations = expandMatrix(config);
      expect(combinations).toEqual([
        { fixture: 'test.json', width: 80, theme: 'dark' },
      ]);
    });
  });

  describe('sharding', () => {
    it('splits combinations across shards', () => {
      const config: MatrixConfig = {
        widths: [60, 80, 100],
        themes: ['dark', 'light'],
        fixtures: ['f1.json', 'f2.json'],
        backend: 'in-process',
        shardIndex: 0,
        shardCount: 2,
      };

      const shard0 = expandMatrix(config);
      const shard1 = expandMatrix({ ...config, shardIndex: 1 });

      expect(shard0.length + shard1.length).toBe(12); // 2 × 3 × 2
      expect(shard0.length).toBeGreaterThan(0);
      expect(shard1.length).toBeGreaterThan(0);
    });

    it('handles single shard', () => {
      const config: MatrixConfig = {
        widths: [80],
        themes: ['dark'],
        fixtures: ['f1.json'],
        backend: 'in-process',
        shardIndex: 0,
        shardCount: 1,
      };

      const combinations = expandMatrix(config);
      expect(combinations).toHaveLength(1);
    });

    it('returns empty for out-of-range shard', () => {
      const config: MatrixConfig = {
        widths: [80],
        themes: ['dark'],
        fixtures: ['f1.json'],
        backend: 'in-process',
        shardIndex: 5,
        shardCount: 2,
      };

      const combinations = expandMatrix(config);
      expect(combinations).toHaveLength(0);
    });
  });

  describe('results', () => {
    it('collects results with timing', async () => {
      const { runMatrix } = await import('../runner/matrix-runner.js');

      const config: MatrixConfig = {
        widths: [80],
        themes: ['dark'],
        fixtures: ['fixtures/lifecycle-running.json'],
        backend: 'in-process',
      };

      const result = await runMatrix(config);

      expect(result.total).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].duration).toBeGreaterThanOrEqual(0);
      expect(['pass', 'fail', 'skip']).toContain(result.results[0].status);
    });
  });
});
