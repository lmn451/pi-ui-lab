// =============================================================================
// ReplayEngine — deterministic replay orchestrator
// =============================================================================

import type {
  Fixture,
  FixtureEvent,
  ReplayFrame,
  UIState,
  RecoveryState,
  Viewport,
} from '../types.js';
import { VirtualClock } from '../clock/virtual-clock.js';
import { DeterministicScheduler } from '../scheduler/scheduler.js';
import { processEvent, type ProcessorState } from './state-processor.js';

export interface ReplayEngineOptions {
  viewport?: Viewport;
  theme?: string;
  captureTerminal?: boolean;
}

export interface ReplayResult {
  frames: ReplayFrame[];
  checkpoints: Map<string, number>;
  finalState: { ui: UIState; recovery: RecoveryState };
}

export class ReplayEngine {
  private fixture: Fixture;
  private options: ReplayEngineOptions;
  private clock: VirtualClock;
  private scheduler: DeterministicScheduler | null = null;
  private frames: ReplayFrame[] = [];
  private checkpoints = new Map<string, number>();
  private currentState: ProcessorState;
  private disposed = false;

  constructor(fixture: Fixture, options: ReplayEngineOptions = {}) {
    this.fixture = fixture;
    this.options = options;
    this.clock = new VirtualClock({ startTime: 0 });
    this.currentState = this.createInitialState();
  }

  async run(): Promise<ReplayResult> {
    this.checkNotDisposed();
    this.initScheduler();

    let cause: ReturnType<DeterministicScheduler['advance']>;
    while ((cause = this.scheduler!.advance()) !== null) {
      this.captureFrame(cause);
    }
    return this.buildResult();
  }

  async runUntil(timeMs: number): Promise<ReplayResult> {
    this.checkNotDisposed();
    this.initScheduler();

    let cause: ReturnType<DeterministicScheduler['advance']>;
    while (this.scheduler!.peekNextTime() !== null && this.scheduler!.peekNextTime()! <= timeMs) {
      cause = this.scheduler!.advance();
      if (cause === null) break;
      this.captureFrame(cause);
    }
    return this.buildResult();
  }

  async runToCheckpoint(name: string): Promise<ReplayResult> {
    this.checkNotDisposed();
    this.initScheduler();

    let cause: ReturnType<DeterministicScheduler['advance']>;
    while ((cause = this.scheduler!.advance()) !== null) {
      this.captureFrame(cause);
      if (this.checkpoints.has(name)) break;
    }
    return this.buildResult();
  }

  step(): ReplayFrame | null {
    this.checkNotDisposed();
    this.initScheduler();

    const cause = this.scheduler!.advance();
    if (cause === null) return null;

    return this.captureFrame(cause);
  }

  getCurrentFrame(): ReplayFrame | null {
    if (this.frames.length === 0) return null;
    return this.frames[this.frames.length - 1];
  }

  getFrameAt(index: number): ReplayFrame | null {
    if (index < 0 || index >= this.frames.length) return null;
    return this.frames[index];
  }

  dispose(): void {
    this.disposed = true;
    this.scheduler = null;
    this.frames = [];
    this.checkpoints.clear();
  }

  private initScheduler(): void {
    if (this.scheduler) return;

    this.scheduler = new DeterministicScheduler({
      clock: this.clock,
      events: this.fixture.timeline,
      pollIntervalMs: this.fixture.pollIntervalMs,
      onEvent: (event, timeMs) => {
        if (typeof event !== 'string') {
          this.processEvent(event, timeMs);
        }
      },
    });
  }

  private processEvent(event: FixtureEvent, timeMs: number): void {
    this.currentState = processEvent(event, this.currentState);

    if (event.type === 'checkpoint' && event.name) {
      this.checkpoints.set(event.name, this.frames.length);
    }
  }

  private captureFrame(cause: string): ReplayFrame {
    const frame: ReplayFrame = {
      index: this.frames.length,
      timeMs: this.clock.now(),
      cause: cause as ReplayFrame['cause'],
      viewport: { ...this.currentState.viewport },
      theme: this.currentState.theme,
      ui: {
        footer: { ...this.currentState.ui.footer },
        widgets: [...this.currentState.ui.widgets],
        notifications: [...this.currentState.ui.notifications],
        toolRenders: [...this.currentState.ui.toolRenders],
      },
      recovery: {
        cursors: { ...this.currentState.recovery.cursors },
        processedReceipts: [...this.currentState.recovery.processedReceipts],
        artifactEvents: [...this.currentState.recovery.artifactEvents],
      },
    };

    this.frames.push(frame);
    return frame;
  }

  private createInitialState(): ProcessorState {
    return {
      ui: {
        footer: { status: 'stale', activeAgents: 0 },
        widgets: [],
        notifications: [],
        toolRenders: [],
      },
      recovery: {
        cursors: {},
        processedReceipts: [],
        artifactEvents: [],
      },
      viewport: this.options.viewport ?? this.fixture.viewport,
      theme: this.options.theme ?? this.fixture.theme,
    };
  }

  private buildResult(): ReplayResult {
    return {
      frames: [...this.frames],
      checkpoints: new Map(this.checkpoints),
      finalState: {
        ui: {
          footer: { ...this.currentState.ui.footer },
          widgets: [...this.currentState.ui.widgets],
          notifications: [...this.currentState.ui.notifications],
          toolRenders: [...this.currentState.ui.toolRenders],
        },
        recovery: {
          cursors: { ...this.currentState.recovery.cursors },
          processedReceipts: [...this.currentState.recovery.processedReceipts],
          artifactEvents: [...this.currentState.recovery.artifactEvents],
        },
      },
    };
  }

  private checkNotDisposed(): void {
    if (this.disposed) {
      throw new Error('ReplayEngine has been disposed');
    }
  }
}
