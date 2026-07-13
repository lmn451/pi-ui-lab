import { describe, expect, it } from 'vitest';
import {
  PTY_BACKEND_PACKAGES,
  PtyBackendUnavailableError,
  assertProcessBackendAvailable,
  detectPtyBackends,
  requirePtyBackend,
} from '../process/index.js';

const unavailable = () => undefined;

function installed(name: string): string {
  return `/optional/${name}/index.js`;
}

describe('optional PTY backend capability', () => {
  it('distinguishes absent and installed-but-not-implemented packages', () => {
    expect(PTY_BACKEND_PACKAGES).toEqual(['node-pty']);
    const absent = detectPtyBackends(unavailable);
    expect(absent.capabilities[0]?.status).toBe('absent');
    const unresolved = detectPtyBackends(() => installed('node-pty'));
    expect(unresolved.available).toBe(false);
    expect(unresolved.backend).toBeNull();
    expect(unresolved.capabilities[0]?.status).toBe('not-implemented');
  });

  it('only selects a backend after an explicit operational probe', () => {
    const status = detectPtyBackends(
      () => installed('node-pty'),
      () => ({ status: 'operational', detail: 'probe passed' }),
    );
    expect(status.available).toBe(true);
    expect(status.backend).toBe('node-pty');
    expect(status.capabilities[0]?.status).toBe('operational');
  });

  it('reports broken probes and never falls back to in-process mode', () => {
    const status = detectPtyBackends(
      () => installed('node-pty'),
      () => ({ status: 'broken', detail: 'native module failed to load' }),
    );
    expect(status.available).toBe(false);
    expect(status.capabilities[0]?.status).toBe('broken');
    expect(() => requirePtyBackend(unavailable)).toThrow(PtyBackendUnavailableError);
    expect(() => assertProcessBackendAvailable('in-process', unavailable)).not.toThrow();
    expect(() => assertProcessBackendAvailable('pty', unavailable)).toThrow(PtyBackendUnavailableError);
  });
});
