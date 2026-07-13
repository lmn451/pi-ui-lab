// =============================================================================
// State processor — pure functions for state transitions
// =============================================================================

import type {
  FixtureEvent,
  UIState,
  RecoveryState,
  Viewport,
  AgentStatus,
} from '../types.js';
import { handleReload } from './reload-handler.js';

export interface ProcessorState {
  ui: UIState;
  recovery: RecoveryState;
  viewport: Viewport;
  theme: string;
}

const defaultUIState = (): UIState => ({
  footer: { status: 'stale', activeAgents: 0 },
  widgets: [],
  notifications: [],
  toolRenders: [],
});

const defaultRecoveryState = (): RecoveryState => ({
  cursors: {},
  processedReceipts: [],
  artifactEvents: [],
});

export function processEvent(
  event: FixtureEvent,
  currentState: ProcessorState,
): ProcessorState {
  switch (event.type) {
    case 'session_start':
      return processSessionStart(event, currentState);
    case 'subagent_started':
      return processSubagentStarted(event, currentState);
    case 'activity':
      return processActivity(event, currentState);
    case 'waiting':
      return processWaiting(event, currentState);
    case 'done':
      return processDone(event, currentState);
    case 'failed':
      return processFailed(event, currentState);
    case 'workflow_updated':
      return processWorkflowUpdated(event, currentState);
    case 'artifact_created':
      return processArtifactCreated(event, currentState);
    case 'artifact_updated':
      return processArtifactUpdated(event, currentState);
    case 'state_written':
      return processStateWritten(event, currentState);
    case 'reload':
      return processReload(event, currentState);
    case 'resize':
      return processResize(event, currentState);
    case 'theme_changed':
      return processThemeChanged(event, currentState);
    case 'key':
    case 'checkpoint':
    case 'poll':
      return currentState;
    default:
      return currentState;
  }
}

function processSessionStart(
  event: Extract<FixtureEvent, { type: 'session_start' }>,
  state: ProcessorState,
): ProcessorState {
  return {
    ...state,
    ui: {
      ...state.ui,
      footer: { ...state.ui.footer, status: 'running' as AgentStatus, activeAgents: 1 },
    },
  };
}

function processSubagentStarted(
  event: Extract<FixtureEvent, { type: 'subagent_started' }>,
  state: ProcessorState,
): ProcessorState {
  const agents = state.ui.footer.activeAgents;
  return {
    ...state,
    ui: {
      ...state.ui,
      footer: {
        ...state.ui.footer,
        status: 'running' as AgentStatus,
        activeAgents: agents + 1,
      },
    },
  };
}

function processActivity(
  _event: Extract<FixtureEvent, { type: 'activity' }>,
  state: ProcessorState,
): ProcessorState {
  return {
    ...state,
    ui: {
      ...state.ui,
      footer: { ...state.ui.footer, status: 'running' as AgentStatus },
    },
  };
}

function processWaiting(
  _event: Extract<FixtureEvent, { type: 'waiting' }>,
  state: ProcessorState,
): ProcessorState {
  return {
    ...state,
    ui: {
      ...state.ui,
      footer: { ...state.ui.footer, status: 'waiting' as AgentStatus },
    },
  };
}

function processDone(
  event: Extract<FixtureEvent, { type: 'done' }>,
  state: ProcessorState,
): ProcessorState {
  const agents = state.ui.footer.activeAgents;
  const newNotifications = [
    ...state.ui.notifications,
    {
      id: `done-${event.at}-${event.agentId ?? 'session'}-${state.ui.notifications.length}`,
      kind: 'success' as const,
      message: event.content ?? 'Task completed',
      timestamp: event.at,
      dismissed: false,
    },
  ];
  return {
    ...state,
    ui: {
      ...state.ui,
      footer: {
        ...state.ui.footer,
        status: 'completed' as AgentStatus,
        activeAgents: Math.max(0, agents - 1),
      },
      notifications: newNotifications,
    },
  };
}

function processFailed(
  event: Extract<FixtureEvent, { type: 'failed' }>,
  state: ProcessorState,
): ProcessorState {
  const agents = state.ui.footer.activeAgents;
  const newNotifications = [
    ...state.ui.notifications,
    {
      id: `failed-${event.at}-${event.agentId ?? 'session'}-${state.ui.notifications.length}`,
      kind: 'error' as const,
      message: event.error ?? 'Task failed',
      timestamp: event.at,
      dismissed: false,
    },
  ];
  return {
    ...state,
    ui: {
      ...state.ui,
      footer: {
        ...state.ui.footer,
        status: 'failed' as AgentStatus,
        activeAgents: Math.max(0, agents - 1),
      },
      notifications: newNotifications,
    },
  };
}

function processWorkflowUpdated(
  _event: Extract<FixtureEvent, { type: 'workflow_updated' }>,
  state: ProcessorState,
): ProcessorState {
  return {
    ...state,
    ui: { ...state.ui },
  };
}

function processArtifactCreated(
  event: Extract<FixtureEvent, { type: 'artifact_created' }>,
  state: ProcessorState,
): ProcessorState {
  const newArtifactEvents = [
    ...state.recovery.artifactEvents,
    {
      id: event.artifactId,
      type: 'created',
      timestamp: event.at,
    },
  ];
  return {
    ...state,
    recovery: { ...state.recovery, artifactEvents: newArtifactEvents },
  };
}

function processArtifactUpdated(
  event: Extract<FixtureEvent, { type: 'artifact_updated' }>,
  state: ProcessorState,
): ProcessorState {
  const newArtifactEvents = [
    ...state.recovery.artifactEvents,
    {
      id: event.artifactId,
      type: 'updated',
      timestamp: event.at,
    },
  ];
  return {
    ...state,
    recovery: { ...state.recovery, artifactEvents: newArtifactEvents },
  };
}

function processStateWritten(
  event: Extract<FixtureEvent, { type: 'state_written' }>,
  state: ProcessorState,
): ProcessorState {
  const value = event.value as string | number | null;
  const newCursors = { ...state.recovery.cursors, [event.key]: value };
  const newReceipts = [...state.recovery.processedReceipts, event.key];
  return {
    ...state,
    recovery: {
      ...state.recovery,
      cursors: newCursors,
      processedReceipts: newReceipts,
    },
  };
}

function processReload(
  event: Extract<FixtureEvent, { type: 'reload' }>,
  state: ProcessorState,
): ProcessorState {
  const reloaded = handleReload(
    { ui: state.ui, recovery: state.recovery },
    event.preserve,
  );
  return {
    ...state,
    ui: reloaded.ui,
    recovery: reloaded.recovery,
  };
}

function processResize(
  event: Extract<FixtureEvent, { type: 'resize' }>,
  state: ProcessorState,
): ProcessorState {
  return {
    ...state,
    viewport: { cols: event.cols, rows: event.rows },
  };
}

function processThemeChanged(
  event: Extract<FixtureEvent, { type: 'theme_changed' }>,
  state: ProcessorState,
): ProcessorState {
  return {
    ...state,
    theme: event.theme,
  };
}
