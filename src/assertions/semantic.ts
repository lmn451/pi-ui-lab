// =============================================================================
// Semantic assertion functions operating on UIState and RecoveryState
// =============================================================================

import type { UIState, RecoveryState, AgentStatus, NotificationState } from '../types.js';
import type { AssertionResult, NotificationMatcher, ArtifactEventMatcher } from './types.js';
import { pass, fail } from './types.js';

/**
 * Assert that the UI state contains the given text in widget rows.
 */
export function toContainText(ui: UIState, text: string): AssertionResult {
  const found = ui.widgets.some(w => w.rows.some(row => row.includes(text)));
  if (found) {
    return pass(`UI contains text "${text}"`);
  }
  return fail(
    `UI does not contain text "${text}"`,
    ui.widgets.map(w => w.rows.join('\n')).join('\n\n'),
    text,
  );
}

/**
 * Assert that the UI footer has the given agent status.
 */
export function toHaveStatus(ui: UIState, status: AgentStatus): AssertionResult {
  const actual = ui.footer.status;
  if (actual === status) {
    return pass(`Footer status is "${status}"`, actual, status);
  }
  return fail(`Footer status is "${actual}"`, actual, status);
}

/**
 * Assert that a widget has the expected number of rows.
 */
export function toHaveWidgetRows(
  ui: UIState,
  widgetId: string,
  expectedRows: number,
): AssertionResult {
  const widget = ui.widgets.find(w => w.id === widgetId);
  if (!widget) {
    return fail(`Widget "${widgetId}" not found`, undefined, expectedRows);
  }
  const actual = widget.rows.length;
  if (actual === expectedRows) {
    return pass(`Widget "${widgetId}" has ${actual} rows`, actual, expectedRows);
  }
  return fail(
    `Widget "${widgetId}" has ${actual} rows`,
    actual,
    expectedRows,
  );
}

/**
 * Assert that the UI has a notification matching the given matcher.
 */
export function toHaveNotification(
  ui: UIState,
  matcher: NotificationMatcher,
): AssertionResult {
  const match = ui.notifications.find((n: NotificationState) => {
    if (matcher.kind && n.kind !== matcher.kind) return false;
    if (matcher.messageContains && !n.message.includes(matcher.messageContains)) return false;
    if (matcher.dismissed !== undefined && n.dismissed !== matcher.dismissed) return false;
    return true;
  });
  if (match) {
    return pass(`Found notification matching matcher`);
  }
  return fail(
    `No notification matching matcher`,
    ui.notifications,
    matcher,
  );
}

/**
 * Assert that the UI has exactly the given number of notifications.
 */
export function toHaveNotificationCount(ui: UIState, count: number): AssertionResult {
  const actual = ui.notifications.length;
  if (actual === count) {
    return pass(`Notification count is ${actual}`, actual, count);
  }
  return fail(`Notification count is ${actual}`, actual, count);
}

/**
 * Assert that the recovery state has a cursor with the given key and value.
 */
export function toHaveCursor(
  recovery: RecoveryState,
  key: string,
  expected: string | number | null,
): AssertionResult {
  if (!(key in recovery.cursors)) {
    return fail(`Cursor "${key}" not found`, undefined, expected);
  }
  const actual = recovery.cursors[key];
  if (actual === expected) {
    return pass(`Cursor "${key}" is ${JSON.stringify(actual)}`, actual, expected);
  }
  return fail(`Cursor "${key}" is ${JSON.stringify(actual)}`, actual, expected);
}

/**
 * Assert that the recovery state has processed the given receipt.
 */
export function toHaveProcessedReceipt(
  recovery: RecoveryState,
  receiptId: string,
): AssertionResult {
  if (recovery.processedReceipts.includes(receiptId)) {
    return pass(`Processed receipt "${receiptId}"`);
  }
  return fail(
    `Receipt "${receiptId}" not processed`,
    recovery.processedReceipts,
    receiptId,
  );
}

/**
 * Assert that the recovery state has an artifact event matching the matcher.
 */
export function toHaveArtifactEvent(
  recovery: RecoveryState,
  matcher: ArtifactEventMatcher,
): AssertionResult {
  const match = recovery.artifactEvents.find(e => {
    if (matcher.type && e.type !== matcher.type) return false;
    if (matcher.afterTimestamp !== undefined && e.timestamp <= matcher.afterTimestamp) return false;
    return true;
  });
  if (match) {
    return pass(`Found artifact event matching matcher`);
  }
  return fail(
    `No artifact event matching matcher`,
    recovery.artifactEvents,
    matcher,
  );
}
