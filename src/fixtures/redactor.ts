import type { FixtureEvent } from '../types.js';

export interface RedactionPattern {
  pattern: RegExp;
  replacement: string;
}

export interface RedactionOptions {
  secretReplacement?: string;
  pathReplacement?: string;
  secretPatterns?: RedactionPattern[];
  pathPatterns?: RedactionPattern[];
}

const DEFAULT_SECRET_PATTERNS: RedactionPattern[] = [
  { pattern: /\b(?:sk|pk|ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]{8,}\b/gi, replacement: '<REDACTED_SECRET>' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: 'Bearer <REDACTED_SECRET>' },
  {
    pattern: /\b(api[_-]?key|token|secret|password|authorization)(\s*[:=]\s*)["']?[^\s"',}]+/gi,
    replacement: '$1$2<REDACTED_SECRET>',
  },
];

const DEFAULT_PATH_PATTERNS: RedactionPattern[] = [
  { pattern: /(?:\/Users|\/home|\/var\/folders|\/private\/tmp|\/tmp)\/[^\s"'`<>]+/g, replacement: '<REDACTED_PATH>' },
  { pattern: /\b[A-Za-z]:\\[^\s"'`<>]+/g, replacement: '<REDACTED_PATH>' },
];

/** Redacts string values without changing object shape or mutating the input. */
export function redact<T>(value: T, options: RedactionOptions = {}): T {
  return redactValue(value, options) as T;
}

export function redactEvent(event: FixtureEvent, options: RedactionOptions = {}): FixtureEvent {
  return redact(event, options);
}

export function redactEvents(events: FixtureEvent[], options: RedactionOptions = {}): FixtureEvent[] {
  return events.map((event) => redactEvent(event, options));
}

function redactValue(value: unknown, options: RedactionOptions): unknown {
  if (typeof value === 'string') return redactString(value, options);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, options));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = redactValue(item, options);
    return result;
  }
  return value;
}

function redactString(value: string, options: RedactionOptions): string {
  const pathReplacement = options.pathReplacement ?? '<REDACTED_PATH>';
  const secretReplacement = options.secretReplacement ?? '<REDACTED_SECRET>';
  const paths = options.pathPatterns ?? DEFAULT_PATH_PATTERNS.map((item) => ({ ...item, replacement: pathReplacement }));
  const secrets = options.secretPatterns ?? defaultSecretPatterns(secretReplacement);
  let result = applyPatterns(value, paths, pathReplacement);
  return applyPatterns(result, secrets, secretReplacement);
}

function defaultSecretPatterns(replacement: string): RedactionPattern[] {
  return DEFAULT_SECRET_PATTERNS.map((item, index) => ({
    ...item,
    replacement: index === 1 ? `Bearer ${replacement}` : index === 2 ? `$1$2${replacement}` : replacement,
  }));
}

function applyPatterns(value: string, patterns: RedactionPattern[], fallback: string): string {
  let result = value;
  for (const item of patterns) {
    const flags = item.pattern.flags.includes('g') ? item.pattern.flags : `${item.pattern.flags}g`;
    const pattern = new RegExp(item.pattern.source, flags);
    result = result.replace(pattern, item.replacement || fallback);
  }
  return result;
}
