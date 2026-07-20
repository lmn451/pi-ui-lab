// =============================================================================
// pi-ui-lab core types
// These are the shared interfaces for the replay engine, fixtures, and assertions.
// =============================================================================

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface TimerHandle {
  readonly id: number;
}

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

// ---------------------------------------------------------------------------
// Fixture and event model
// ---------------------------------------------------------------------------

export type FixtureVersion = 1;

export type EventType =
  | 'session_start'
  | 'subagent_started'
  | 'activity'
  | 'waiting'
  | 'done'
  | 'failed'
  | 'workflow_updated'
  | 'artifact_created'
  | 'artifact_updated'
  | 'state_written'
  | 'poll'
  | 'reload'
  | 'resize'
  | 'theme_changed'
  | 'key'
  | 'checkpoint';

export interface BaseFixtureEvent {
  at: number;
  type: EventType;
  name?: string;
}

export interface SessionStartEvent extends BaseFixtureEvent {
  type: 'session_start';
  sessionDir?: string;
}

export interface SubagentStartedEvent extends BaseFixtureEvent {
  type: 'subagent_started';
  agentId: string;
  agentName: string;
  model?: string;
}

export interface ActivityEvent extends BaseFixtureEvent {
  type: 'activity';
  agentId?: string;
  content?: string;
}

export interface WaitingEvent extends BaseFixtureEvent {
  type: 'waiting';
  agentId?: string;
  reason?: string;
}

export interface DoneEvent extends BaseFixtureEvent {
  type: 'done';
  agentId?: string;
  content?: string;
}

export interface FailedEvent extends BaseFixtureEvent {
  type: 'failed';
  agentId?: string;
  error?: string;
}

export interface WorkflowUpdatedEvent extends BaseFixtureEvent {
  type: 'workflow_updated';
  workflowId?: string;
  status?: string;
}

export interface ArtifactCreatedEvent extends BaseFixtureEvent {
  type: 'artifact_created';
  artifactId: string;
  artifactPath: string;
}

export interface ArtifactUpdatedEvent extends BaseFixtureEvent {
  type: 'artifact_updated';
  artifactId: string;
}

export interface StateWrittenEvent extends BaseFixtureEvent {
  type: 'state_written';
  key: string;
  value: unknown;
}

export interface PollEvent extends BaseFixtureEvent {
  type: 'poll';
}

export interface ReloadEvent extends BaseFixtureEvent {
  type: 'reload';
  preserve: string[];
}

export interface ResizeEvent extends BaseFixtureEvent {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface ThemeChangedEvent extends BaseFixtureEvent {
  type: 'theme_changed';
  theme: string;
}

export interface KeyEvent extends BaseFixtureEvent {
  type: 'key';
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export interface CheckpointEvent extends BaseFixtureEvent {
  type: 'checkpoint';
  name: string;
}

export type FixtureEvent =
  | SessionStartEvent
  | SubagentStartedEvent
  | ActivityEvent
  | WaitingEvent
  | DoneEvent
  | FailedEvent
  | WorkflowUpdatedEvent
  | ArtifactCreatedEvent
  | ArtifactUpdatedEvent
  | StateWrittenEvent
  | PollEvent
  | ReloadEvent
  | ResizeEvent
  | ThemeChangedEvent
  | KeyEvent
  | CheckpointEvent;

export interface Viewport {
  cols: number;
  rows: number;
}

export interface Fixture {
  $schema?: string;
  version: FixtureVersion;
  name: string;
  description?: string;
  viewport: Viewport;
  theme: string;
  pollIntervalMs: number;
  timeline: FixtureEvent[];
  imports?: ImportSpec[];
}

export interface ImportSpec {
  source: string;
  type?: 'session' | 'events' | 'state' | 'artifacts';
}

// ---------------------------------------------------------------------------
// Replay engine
// ---------------------------------------------------------------------------

export type FrameCause =
  | 'fixture_event'
  | 'poll'
  | 'reload'
  | 'resize'
  | 'theme_change'
  | 'initial';

// ---------------------------------------------------------------------------
// UI state model
// ---------------------------------------------------------------------------

export type AgentStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'stale';

export interface FooterState {
  status: AgentStatus;
  activeAgents: number;
  elapsed?: number;
}

export interface WidgetState {
  id: string;
  label: string;
  rows: string[];
  visible: boolean;
}

export interface NotificationState {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: number;
  dismissed: boolean;
}

export interface ToolRenderState {
  toolName: string;
  content: string;
}

export interface UIState {
  footer: FooterState;
  widgets: WidgetState[];
  notifications: NotificationState[];
  toolRenders: ToolRenderState[];
}

// ---------------------------------------------------------------------------
// Recovery state model
// ---------------------------------------------------------------------------

export interface ArtifactEvent {
  id: string;
  type: string;
  timestamp: number;
}

export interface RecoveryState {
  cursors: Record<string, string | number | null>;
  processedReceipts: string[];
  artifactEvents: ArtifactEvent[];
}

// ---------------------------------------------------------------------------
// Terminal state model
// ---------------------------------------------------------------------------

export interface Cell {
  char: string;
  width: number;
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export type CellGrid = Cell[][];

export interface CursorState {
  row: number;
  col: number;
  visible: boolean;
}

export interface OverflowReport {
  horizontal: boolean;
  vertical: boolean;
  clippedCells: number;
  scrollbackLines: number;
  unexpectedWrap: boolean;
  /** Number of malformed/overlapping wide-character cells. */
  collisions: number;
  /** True when any cell collision was detected. */
  collision: boolean;
  /** Rows whose cell arrays extend beyond the viewport width. */
  rowOverflows: number[];
  /** Wide cells that cannot fit in the viewport. */
  wideCharClips: number;
}

export interface TerminalState {
  ansi: string;
  text: string;
  cells: CellGrid;
  cursor: CursorState;
  overflow: OverflowReport;
}

// ---------------------------------------------------------------------------
// Replay frame
// ---------------------------------------------------------------------------

export interface ReplayFrame {
  index: number;
  timeMs: number;
  cause: FrameCause;
  viewport: Viewport;
  theme: string;
  ui: UIState;
  recovery: RecoveryState;
  terminal?: TerminalState;
}

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

export type ExecutionMode = 'model' | 'sut' | 'pty';

export interface TextSnapshot {
  frames: Array<{
    index: number;
    timeMs: number;
    text: string;
  }>;
  metadata: SnapshotMetadata;
}

export interface CellSnapshot {
  frames: Array<{
    index: number;
    timeMs: number;
    cells: CellGrid;
  }>;
  metadata: SnapshotMetadata;
}

export interface SnapshotMetadata {
  fixtureName: string;
  fixtureHash: string;
  platform: string;
  nodeVersion: string;
  timestamp: string;
  viewport: Viewport;
  theme: string;
  executionMode: ExecutionMode;
}
