import { describe, expect, it, afterEach } from 'vitest';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runScreenshot } from '../cli/commands/screenshot.js';

const fixture = resolve(import.meta.dirname, '../../fixtures/lifecycle/running.json');
const output = '/tmp/pi-ui-lab-screenshot-test';

afterEach(async () => {
  process.exitCode = 0;
  await unlink(`${output}.svg`).catch(() => undefined);
  await unlink(`${output}.png`).catch(() => undefined);
});

describe('screenshot command', () => {
  it('renders a deterministic SVG at a checkpoint', async () => {
    await runScreenshot(fixture, { checkpoint: 'midpoint', format: 'svg', output: `${output}.svg` });
    const svg = await readFile(`${output}.svg`, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<text');
  });

  it('renders a PNG at a timestamp', async () => {
    await runScreenshot(fixture, { at: 500, format: 'png', output: `${output}.png` });
    const png = await readFile(`${output}.png`);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it('returns exit code 3 for unavailable pi-shot', async () => {
    await runScreenshot(fixture, { backend: 'pi-shot' });
    expect(process.exitCode).toBe(3);
  });
});
