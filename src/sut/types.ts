import type { Fixture, FixtureEvent, ReplayFrame, RecoveryState, UIState, Viewport } from '../types.js';

export interface ExternalSutConfig {
  /** Absolute or cwd-relative production extension entry path. */
  extensionPath: string;
  /** Absolute or cwd-relative module path containing SUT test-access exports. */
  modulePath: string;
  /** Existing sandbox cwd used by the external production code. */
  cwd: string;
}

export interface SutUiCall {
  method: string;
  args: unknown[];
}

export interface SutObserverResult {
  frames: ReplayFrame[];
  ui: UIState;
  recovery: RecoveryState;
  uiCalls: SutUiCall[];
  notifications: SutUiCall[];
}

export interface SutObservationContext {
  readonly config: ExternalSutConfig;
  readonly fixture: Fixture;
  readonly cwd: string;
  readonly uiCalls: SutUiCall[];
  readonly notificationCalls: SutUiCall[];
  readonly module: Record<string, unknown>;
  readonly session: unknown;
  readonly pi: unknown;
  readonly event?: FixtureEvent;
}

export interface ExternalFixtureAdapter {
  materializeEvent(event: FixtureEvent, context: SutObservationContext): Promise<void> | void;
  invokeEvent(event: FixtureEvent, context: SutObservationContext): Promise<void> | void;
  observe(context: SutObservationContext): { ui: UIState; recovery: RecoveryState };
}

export interface TestSessionLike {
  cwd: string;
  events: { ui: Array<{ method: string; args: unknown[] }> };
  session: unknown;
  dispose(): void;
}

export interface HarnessLike {
  createTestSession(options: {
    extensions: string[];
    cwd: string;
    mockUI: Record<string, never>;
  }): Promise<TestSessionLike>;
}

export interface PiHarnessSutAdapterOptions {
  harness?: HarnessLike;
  fixtureAdapter?: ExternalFixtureAdapter;
  moduleLoader?: (modulePath: string) => Promise<Record<string, unknown>>;
  now?: () => number;
  viewport?: Viewport;
  theme?: string;
}

export interface PiHarnessSutAdapterLike {
  run(fixture: Fixture): Promise<SutObserverResult>;
}
