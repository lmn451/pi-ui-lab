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
    if (key === 'ui' && currentState.ui) {
      newState.ui = {
        footer: { ...currentState.ui.footer },
        widgets: [...currentState.ui.widgets],
        notifications: [...currentState.ui.notifications],
        toolRenders: [...currentState.ui.toolRenders],
      };
    }
    if (key === 'recovery' && currentState.recovery) {
      newState.recovery = {
        cursors: { ...currentState.recovery.cursors },
        processedReceipts: [...currentState.recovery.processedReceipts],
        artifactEvents: [...currentState.recovery.artifactEvents],
      };
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

function createEmptyRecoveryState(): RecoveryState {
  return {
    cursors: {},
    processedReceipts: [],
    artifactEvents: [],
  };
}
