import { FixtureLoader } from '../fixtures/index.js';
import { ReplayEngine, type ReplayEngineOptions, type ReplayResult } from '../replay/index.js';
import type { Fixture, ReplayFrame, Viewport } from '../types.js';

export const UI_LAB_COMMAND_NAME = '/ui-lab';

export type UiLabCommandAction = 'inspect' | 'replay';

export interface UiLabCommandRequest {
  fixturePath: string;
  action?: UiLabCommandAction;
  at?: number;
  checkpoint?: string;
  viewport?: Viewport;
  theme?: string;
}

export interface UiLabInspection {
  fixturePath: string;
  frame: ReplayFrame | null;
  result: ReplayResult;
}

export interface InspectorSessionOptions extends ReplayEngineOptions {
  loader?: FixtureLoader;
}

export interface InspectorSession {
  replay(request?: Pick<UiLabCommandRequest, 'at' | 'checkpoint'>): Promise<ReplayResult>;
  inspect(request?: Pick<UiLabCommandRequest, 'at' | 'checkpoint'>): Promise<UiLabInspection>;
  step(): ReplayFrame | null;
  dispose(): void;
}

export type InspectorSessionFactory = (
  fixturePath: string,
  options: InspectorSessionOptions,
) => Promise<InspectorSession>;

/**
 * Minimal session used by the optional command adapter. It intentionally wraps
 * ReplayEngine instead of reproducing replay or state-processing behavior.
 */
export class UiLabInspectorSession implements InspectorSession {
  private constructor(
    private readonly fixturePath: string,
    private readonly engine: ReplayEngine,
  ) {}

  static async open(
    fixturePath: string,
    options: InspectorSessionOptions = {},
  ): Promise<UiLabInspectorSession> {
    const loader = options.loader ?? new FixtureLoader();
    const fixture = await loader.load(fixturePath);
    const engineOptions: ReplayEngineOptions = {
      viewport: options.viewport,
      theme: options.theme,
      captureTerminal: options.captureTerminal,
    };
    return new UiLabInspectorSession(
      fixturePath,
      new ReplayEngine(fixture, engineOptions),
    );
  }

  async replay(
    request: Pick<UiLabCommandRequest, 'at' | 'checkpoint'> = {},
  ): Promise<ReplayResult> {
    if (request.checkpoint !== undefined) {
      return this.engine.runToCheckpoint(request.checkpoint);
    }
    if (request.at !== undefined) {
      return this.engine.runUntil(request.at);
    }
    return this.engine.run();
  }

  async inspect(
    request: Pick<UiLabCommandRequest, 'at' | 'checkpoint'> = {},
  ): Promise<UiLabInspection> {
    const result = await this.replay(request);
    return {
      fixturePath: this.fixturePath,
      frame: result.frames.at(-1) ?? null,
      result,
    };
  }

  step(): ReplayFrame | null {
    return this.engine.step();
  }

  dispose(): void {
    this.engine.dispose();
  }
}

export interface UiLabCommandDefinition {
  readonly name: typeof UI_LAB_COMMAND_NAME;
  readonly description: string;
  execute(
    request: UiLabCommandRequest | string,
  ): Promise<UiLabInspection | ReplayResult>;
}

export interface UiLabCommandOptions {
  sessionFactory?: InspectorSessionFactory;
  sessionOptions?: Omit<InspectorSessionOptions, 'loader'>;
}

/**
 * Creates a Pi-independent command definition. A Pi extension can map its
 * command arguments to this request without importing any Pi implementation.
 */
export function createUiLabCommand(
  options: UiLabCommandOptions = {},
): UiLabCommandDefinition {
  const sessionFactory = options.sessionFactory ?? UiLabInspectorSession.open;

  return {
    name: UI_LAB_COMMAND_NAME,
    description: 'Inspect or replay a pi-ui-lab fixture',
    async execute(input: UiLabCommandRequest | string) {
      const request = normalizeRequest(input);
      const session = await sessionFactory(request.fixturePath, {
        ...options.sessionOptions,
        viewport: request.viewport ?? options.sessionOptions?.viewport,
        theme: request.theme ?? options.sessionOptions?.theme,
      });
      try {
        if (request.action === 'replay') {
          return session.replay(request);
        }
        return session.inspect(request);
      } finally {
        session.dispose();
      }
    },
  };
}

function normalizeRequest(
  input: UiLabCommandRequest | string,
): UiLabCommandRequest {
  const request = typeof input === 'string'
    ? { fixturePath: input }
    : input;
  if (!request.fixturePath.trim()) {
    throw new Error('ui-lab requires a fixture path');
  }
  if (request.at !== undefined && (!Number.isFinite(request.at) || request.at < 0)) {
    throw new Error('ui-lab time must be a non-negative number');
  }
  return request;
}

export type { Fixture };
