const DEFAULT_PI_MODULE = '@earendil-works/pi-coding-agent';

export type PiCompatibilityStatus = 'absent' | 'importable' | 'compatible';

export interface PiCompatibilityReport {
  optional: true;
  /** Backward-compatible alias for importable. */
  available: boolean;
  importable: boolean;
  compatible: boolean;
  status: PiCompatibilityStatus;
  moduleName: string;
  detail: string;
}

/**
 * Loads a Pi package only when a host explicitly asks for it. The adapter does
 * not import or inspect private Pi APIs, so this remains safe across Pi versions.
 */
export async function loadOptionalPiApi(
  moduleName = DEFAULT_PI_MODULE,
): Promise<unknown | undefined> {
  const normalizedName = normalizeModuleName(moduleName);
  try {
    return await import(normalizedName);
  } catch {
    return undefined;
  }
}

/** Reports importability separately from the public extension runtime check. */
export async function checkPiCompatibility(
  moduleName = DEFAULT_PI_MODULE,
): Promise<PiCompatibilityReport> {
  const normalizedName = normalizeModuleName(moduleName);
  const api = await loadOptionalPiApi(normalizedName);
  if (api === undefined) {
    return createReport(normalizedName, 'absent',
      'Pi package is not importable; the ui-lab extension cannot load.');
  }
  if (!hasPublicExtensionRuntime(api)) {
    return createReport(normalizedName, 'importable',
      'Pi package is importable but its documented extension runtime is unavailable.');
  }
  return createReport(normalizedName, 'compatible',
    'Pi package is importable and exposes the documented extension runtime.');
}

function createReport(
  moduleName: string,
  status: PiCompatibilityStatus,
  detail: string,
): PiCompatibilityReport {
  return {
    optional: true,
    available: status !== 'absent',
    importable: status !== 'absent',
    compatible: status === 'compatible',
    status,
    moduleName,
    detail,
  };
}

function hasPublicExtensionRuntime(api: unknown): boolean {
  if (typeof api !== 'object' || api === null) return false;
  const exports = api as Record<string, unknown>;
  return typeof exports.createExtensionRuntime === 'function'
    && typeof exports.discoverAndLoadExtensions === 'function'
    && typeof exports.ExtensionRunner === 'function';
}

function normalizeModuleName(moduleName: string): string {
  if (!moduleName.trim()) {
    throw new Error('Pi module name must not be empty');
  }
  return moduleName;
}
