// =============================================================================
// Optional PTY capability detection
// =============================================================================

import { createRequire } from 'node:module';

/** A package name is not evidence that this project's PTY integration works. */
export const PTY_BACKEND_PACKAGES = ['node-pty'] as const;

export type PtyBackendName = (typeof PTY_BACKEND_PACKAGES)[number];
export type PtyCapabilityStatus = 'absent' | 'broken' | 'operational' | 'not-implemented';

export interface PtyBackendCapability {
  name: PtyBackendName;
  packageName: PtyBackendName;
  status: PtyCapabilityStatus;
  /** True only for an operational, verified backend. */
  available: boolean;
  detail: string;
}

export interface PtyBackendStatus {
  available: boolean;
  backend: PtyBackendName | null;
  capabilities: readonly PtyBackendCapability[];
  reason?: string;
}

export type OptionalPackageResolver = (
  packageName: PtyBackendName,
) => string | undefined;
export type OptionalPackageProbe = (
  packageName: PtyBackendName,
  location: string,
) => { status: Exclude<PtyCapabilityStatus, 'absent' | 'not-implemented'>; detail: string };

const requireFromProject = createRequire(import.meta.url);

function resolveOptionalPackage(packageName: PtyBackendName): string | undefined {
  try {
    return requireFromProject.resolve(packageName);
  } catch {
    return undefined;
  }
}

function describeCapability(
  packageName: PtyBackendName,
  resolvePackage: OptionalPackageResolver,
  probePackage: OptionalPackageProbe | undefined,
): PtyBackendCapability {
  const location = resolvePackage(packageName);
  if (location === undefined) {
    return { name: packageName, packageName, status: 'absent', available: false, detail: 'not installed' };
  }
  if (probePackage === undefined) {
    return {
      name: packageName,
      packageName,
      status: 'not-implemented',
      available: false,
      detail: `installed at ${location}, but pi-ui-lab has no verified PTY integration`,
    };
  }
  const result = probePackage(packageName, location);
  return { name: packageName, packageName, status: result.status, available: result.status === 'operational', detail: result.detail };
}

/** Detects packages without importing or executing them; selection requires an explicit probe. */
export function detectPtyBackends(
  resolvePackage: OptionalPackageResolver = resolveOptionalPackage,
  probePackage?: OptionalPackageProbe,
): PtyBackendStatus {
  const capabilities = PTY_BACKEND_PACKAGES.map((name) =>
    describeCapability(name, resolvePackage, probePackage),
  );
  const selected = capabilities.find((capability) => capability.status === 'operational');
  if (selected) return { available: true, backend: selected.name, capabilities };
  return {
    available: false,
    backend: null,
    capabilities,
    reason: summarizeUnavailable(capabilities),
  };
}

function summarizeUnavailable(capabilities: readonly PtyBackendCapability[]): string {
  const details = capabilities.map((capability) => `${capability.name}: ${capability.status}`).join(', ');
  return `No operational PTY backend (${details}). In-process mode is not a PTY.`;
}

export function getPtyBackendStatus(
  resolvePackage: OptionalPackageResolver = resolveOptionalPackage,
  probePackage?: OptionalPackageProbe,
): PtyBackendStatus {
  return detectPtyBackends(resolvePackage, probePackage);
}

export function isPtyAvailable(
  resolvePackage: OptionalPackageResolver = resolveOptionalPackage,
  probePackage?: OptionalPackageProbe,
): boolean {
  return getPtyBackendStatus(resolvePackage, probePackage).available;
}

export class PtyBackendUnavailableError extends Error {
  readonly status: PtyBackendStatus;

  constructor(status: PtyBackendStatus = getPtyBackendStatus()) {
    super(status.reason ?? `The ${status.backend ?? 'selected'} PTY backend is unavailable.`);
    this.name = 'PtyBackendUnavailableError';
    this.status = status;
  }
}

/** Require an actual operational PTY capability; never fall back to in-process execution. */
export function requirePtyBackend(
  resolvePackage: OptionalPackageResolver = resolveOptionalPackage,
  probePackage?: OptionalPackageProbe,
): PtyBackendName {
  const status = getPtyBackendStatus(resolvePackage, probePackage);
  if (!status.available || status.backend === null) throw new PtyBackendUnavailableError(status);
  return status.backend;
}

export type ProcessBackendKind = 'in-process' | 'pty';

export function assertProcessBackendAvailable(
  backend: ProcessBackendKind,
  resolvePackage: OptionalPackageResolver = resolveOptionalPackage,
  probePackage?: OptionalPackageProbe,
): void {
  if (backend === 'pty') requirePtyBackend(resolvePackage, probePackage);
}

/** Execute a bounded child through node-pty and verify output plus clean exit. */
export async function probePtyBackend(): Promise<{ status: Exclude<PtyCapabilityStatus, 'absent' | 'not-implemented'>; detail: string }> {
  try {
    const { runPty } = await import('./node-pty-runner.js');
    const result = await runPty({
      executable: process.execPath,
      args: ['-e', "process.stdout.write('PTY_OK')"],
      cols: 80, rows: 24, timeoutMs: 2_000,
    });
    if (result.status !== 'exited' || result.exitCode !== 0 || result.output !== 'PTY_OK') {
      return { status: 'broken', detail: `probe failed (status=${result.status}, exit=${result.exitCode}, output=${JSON.stringify(result.output)})` };
    }
    return { status: 'operational', detail: 'spawn/output/exit probe passed' };
  } catch (error) {
    return { status: 'broken', detail: `probe failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function getPtyBackendStatusAsync(
  resolvePackage: OptionalPackageResolver = resolveOptionalPackage,
 ): Promise<PtyBackendStatus> {
  const capabilities: PtyBackendCapability[] = [];
  for (const name of PTY_BACKEND_PACKAGES) {
    const location = resolvePackage(name);
    if (location === undefined) {
      capabilities.push({ name, packageName: name, status: 'absent', available: false, detail: 'not installed' });
      continue;
    }
    const result = await probePtyBackend();
    capabilities.push({ name, packageName: name, status: result.status, available: result.status === 'operational', detail: result.detail });
  }
  const selected = capabilities.find((capability) => capability.status === 'operational');
  if (selected) return { available: true, backend: selected.name, capabilities };
  return { available: false, backend: null, capabilities, reason: summarizeUnavailable(capabilities) };
}

/** Async capability gate used by operational callers. */
export async function requirePtyBackendAsync(
  resolvePackage: OptionalPackageResolver = resolveOptionalPackage,
 ): Promise<PtyBackendName> {
  const status = await getPtyBackendStatusAsync(resolvePackage);
  if (!status.available || status.backend === null) throw new PtyBackendUnavailableError(status);
  return status.backend;
}

export async function isPtyAvailableAsync(
  resolvePackage: OptionalPackageResolver = resolveOptionalPackage,
 ): Promise<boolean> {
  return (await getPtyBackendStatusAsync(resolvePackage)).available;
}
