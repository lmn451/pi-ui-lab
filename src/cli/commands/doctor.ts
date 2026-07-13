import { getPtyBackendStatusAsync } from '../../process/index.js';
import { checkPiCompatibility } from '../../pi-adapter/index.js';

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
}

export async function runDoctor(requirement?: string): Promise<void> {
  const results: CheckResult[] = [];
  const required = parseRequirement(requirement);
  results.push(checkNodeVersion());
  const pty = await checkPtyBackends();
  results.push(...pty.results);
  const pi = await checkPiCompatibility();
  results.push({
    name: 'Pi /ui-lab',
    status: pi.compatible ? 'ok' : 'warn',
    detail: pi.detail,
  });
  addRequirementFailure(results, required, pi.compatible, pty.operational);
  printTable(results);
  process.exit(results.some((result) => result.status === 'error') ? 3 : 0);
}

function parseRequirement(requirement: string | undefined): 'pi' | 'pty' | undefined {
  if (requirement === undefined) return undefined;
  if (requirement === 'pi' || requirement === 'pty') return requirement;
  throw new Error(`--require must be pi or pty (received ${requirement})`);
}

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1), 10);
  if (major >= 22) return { name: 'Node.js', status: 'ok', detail: version };
  return { name: 'Node.js', status: 'error', detail: `${version} (>= 22 required)` };
}

async function checkPtyBackends(): Promise<{ results: CheckResult[]; operational: boolean }> {
  const status = await getPtyBackendStatusAsync();
  return {
    operational: status.available,
    results: status.capabilities.map((capability) => ({
      name: `PTY ${capability.name}`,
      status: capability.status === 'operational' ? 'ok' : 'warn',
      detail: capability.detail,
    })),
  };
}

function addRequirementFailure(
  results: CheckResult[],
  requirement: 'pi' | 'pty' | undefined,
  piCompatible: boolean,
  ptyOperational: boolean,
): void {
  if (requirement === 'pi' && !piCompatible) {
    results.push({ name: 'Required pi', status: 'error', detail: 'No compatible Pi extension runtime' });
  }
  if (requirement === 'pty' && !ptyOperational) {
    results.push({ name: 'Required pty', status: 'error', detail: 'No operational PTY backend' });
  }
}

function printTable(results: CheckResult[]): void {
  const icon = (status: CheckResult['status']) =>
    status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
  console.log('pi-ui-lab doctor\n');
  for (const result of results) {
    console.log(`  ${icon(result.status)}  ${result.name.padEnd(12)} ${result.detail}`);
  }
  console.log();
}
