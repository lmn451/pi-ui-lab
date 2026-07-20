// =============================================================================
// Reload handler — simulates a runtime reload preserving only declared stores
// =============================================================================

import type { UIState, RecoveryState } from '../types.js';

export interface ReloadableState {
  ui: UIState;
  recovery: RecoveryState;
}

/**
 * Create a brand new state object, copying only the keys listed in `preserve`.
 * This simulates a real runtime reload, not an in-memory reset.
 */
export function handleReload(
  currentState: ReloadableState,
  preserve: string[],
): ReloadableState {
  const newState: ReloadableState = {
    ui: createEmptyUIState(),
    recovery: createEmptyRecoveryState(),
  };

  for (const key of preserve) {
    if (key === 'ui') {
      newState.ui = {
        footer: { ...currentState.ui.footer },
        widgets: [...currentState.ui.widgets],
        notifications: [...currentState.ui.notifications],
        toolRenders: [...currentState.ui.toolRenders],
      };
      continue;
    }
    if (key === 'recovery' || key === 'state') {
      newState.recovery = cloneRecovery(currentState.recovery);
      continue;
    }
    if (key === 'processedReceipts') {
      newState.recovery.processedReceipts = [...currentState.recovery.processedReceipts];
      continue;
    }
    if (key === 'artifactEvents' || key === 'artifacts') {
      newState.recovery.artifactEvents = [...currentState.recovery.artifactEvents];
      continue;
    }
    if (key in currentState.recovery.cursors) {
      newState.recovery.cursors[key] = currentState.recovery.cursors[key];
    }
  }

  return newState;
}

function createEmptyUIState(): UIState {
  return {
    footer: { status: 'stale', activeAgents: 0 },
    widgets: [],
    notifications: [],
    toolRenders: [],
  };
}

function cloneRecovery(recovery: RecoveryState): RecoveryState {
  return {
    cursors: { ...recovery.cursors },
    processedReceipts: [...recovery.processedReceipts],
    artifactEvents: [...recovery.artifactEvents],
  };
}

function createEmptyRecoveryState(): RecoveryState {
  return {
    cursors: {},
    processedReceipts: [],
    artifactEvents: [],
  };
}
