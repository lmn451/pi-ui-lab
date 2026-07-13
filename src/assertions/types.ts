// =============================================================================
// Assertion result types for pi-ui-lab
// =============================================================================

import type { NotificationState } from '../types.js';

export interface AssertionResult {
  pass: boolean;
  message: string;
  actual?: unknown;
  expected?: unknown;
  diff?: string;
}

export interface NotificationMatcher {
  kind?: NotificationState['kind'];
  messageContains?: string;
  dismissed?: boolean;
}

export interface ArtifactEventMatcher {
  type?: string;
  afterTimestamp?: number;
}

/**
 * Create a passing assertion result.
 */
export function pass(message: string, actual?: unknown, expected?: unknown): AssertionResult {
  return { pass: true, message, actual, expected };
}

/**
 * Create a failing assertion result.
 */
export function fail(message: string, actual?: unknown, expected?: unknown): AssertionResult {
  return { pass: false, message, actual, expected };
}
