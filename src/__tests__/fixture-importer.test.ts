import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importFixture, redact } from '../fixtures/index.js';

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pi-ui-lab-import-'));
}

describe('fixture importer', () => {
  it('imports JSONL, state, and artifacts without modifying sources', async () => {
    const root = await makeTempDir();
    const session = join(root, 'session.jsonl');
    const state = join(root, 'state.json');
    const artifacts = join(root, 'artifacts');
    const output = join(root, 'fixture');
    await mkdir(artifacts);
    await writeFile(session, '{"at":10,"type":"activity","content":"token=secret"}\n');
    await writeFile(state, '{"cursor":2}');
    await writeFile(join(artifacts, 'output.txt'), 'result');
    const before = await Promise.all([readFile(session), readFile(state), readFile(join(artifacts, 'output.txt'))]);
    const result = await importFixture({ session, state, artifacts, output });
    const after = await Promise.all([readFile(session), readFile(state), readFile(join(artifacts, 'output.txt'))]);
    expect(result.fixture.version).toBe(1);
    expect(result.fixture.timeline.map((event) => event.type)).toEqual(['state_written', 'artifact_created', 'activity']);
    expect(result.fixture.timeline[2]).toMatchObject({ content: 'token=<REDACTED_SECRET>' });
    expect(after).toEqual(before);
    await expect(readFile(join(output, 'artifacts/output.txt'), 'utf8')).resolves.toBe('result');
    await rm(root, { recursive: true, force: true });
  });

  it('rejects output paths that overlap a source directory', async () => {
    const root = await makeTempDir();
    const artifacts = join(root, 'artifacts');
    await mkdir(artifacts);
    await expect(importFixture({ artifacts, output: join(artifacts, 'nested') })).rejects.toThrow('overlap source');
    await rm(root, { recursive: true, force: true });
  });

  it('rejects symlinks in artifact directories', async () => {
    const root = await makeTempDir();
    const artifacts = join(root, 'artifacts');
    await mkdir(artifacts);
    await writeFile(join(root, 'outside.txt'), 'outside');
    await symlink(join(root, 'outside.txt'), join(artifacts, 'link.txt'));
    await expect(importFixture({ artifacts, output: join(root, 'fixture') })).rejects.toThrow('symlinks');
    await rm(root, { recursive: true, force: true });
  });
});

describe('redactor', () => {
  it('is deterministic, recursive, and non-mutating', () => {
    const input = { message: 'Bearer abc123', nested: ['/Users/alice/private'] };
    const copy = JSON.parse(JSON.stringify(input));
    expect(redact(input)).toEqual({ message: 'Bearer <REDACTED_SECRET>', nested: ['<REDACTED_PATH>'] });
    expect(redact(input)).toEqual(redact(input));
    expect(input).toEqual(copy);
  });
});
