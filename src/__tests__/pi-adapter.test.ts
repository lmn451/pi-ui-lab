import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkPiCompatibility,
  createUiLabCommand,
  UI_LAB_COMMAND_NAME,
  type ReplayResult,
} from '../index.js';

const fixturePath = resolve(
  process.cwd(),
  'fixtures/workflow/inject-cap-degradation.json',
);

describe('Pi adapter', () => {
  it('imports and delegates replay without Pi or a model', async () => {
    const command = createUiLabCommand();
    const result = await command.execute({
      fixturePath,
      action: 'replay',
      checkpoint: 'fallback-activated',
    }) as ReplayResult;

    expect(command.name).toBe(UI_LAB_COMMAND_NAME);
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.checkpoints.has('fallback-activated')).toBe(true);
    expect(result.finalState.ui.footer.status).toBe('running');
  });

  it('returns the last frame for inspect requests', async () => {
    const command = createUiLabCommand();
    const inspection = await command.execute({
      fixturePath,
      action: 'inspect',
      at: 500,
    });

    expect('frame' in inspection).toBe(true);
    if ('frame' in inspection) {
      expect(inspection.fixturePath).toBe(fixturePath);
      expect(inspection.frame?.timeMs).toBeLessThanOrEqual(500);
    }
  });

  it('reports missing Pi APIs as optional', async () => {
    const report = await checkPiCompatibility(
      'pi-ui-lab-test-module-that-is-not-installed',
    );

    expect(report.optional).toBe(true);
    expect(report.available).toBe(false);
    expect(report.status).toBe('absent');
  });

  it('does not call an importable but incompatible module compatible', async () => {
    const report = await checkPiCompatibility('node:path');
    expect(report.importable).toBe(true);
    expect(report.compatible).toBe(false);
    expect(report.status).toBe('importable');
  });
});
