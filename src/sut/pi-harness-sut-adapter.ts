import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Fixture, FixtureEvent, NotificationState, ReplayFrame, RecoveryState, UIState } from '../types.js';
import { createPiSubagenturaAdapter } from './pi-subagentura-adapter.js';
import type {
  ExternalFixtureAdapter, ExternalSutConfig, HarnessLike, PiHarnessSutAdapterOptions,
  SutObservationContext, SutObserverResult, SutUiCall, TestSessionLike,
} from './types.js';

/** Runs a production extension through pi-test-harness without importing its source. */
export class PiHarnessSutAdapter {
  private readonly config: ExternalSutConfig;
  private readonly options: PiHarnessSutAdapterOptions;
  private readonly fixtureAdapter: ExternalFixtureAdapter;
  private readonly now: () => number;

  constructor(config: ExternalSutConfig, options: PiHarnessSutAdapterOptions = {}) {
    this.config = validateConfig(config);
    this.options = options;
    this.fixtureAdapter = options.fixtureAdapter ?? createPiSubagenturaAdapter();
    this.now = options.now ?? Date.now;
  }

  async run(fixture: Fixture): Promise<SutObserverResult> {
    const harness = await this.loadHarness();
    const module = await this.loadModule();
    const session = await harness.createTestSession({
      extensions: [resolve(this.config.cwd, this.config.extensionPath)],
      cwd: this.config.cwd,
      mockUI: {},
    });
    const uiCalls = session.events.ui as SutUiCall[];
    const notificationCalls: SutUiCall[] = [];
    const pi = { sendMessage: (...args: unknown[]) => notificationCalls.push({ method: 'sendMessage', args }) };
    installUiBoundary(pi, session);
    const frames: ReplayFrame[] = [];
    try {
      for (const event of fixture.timeline) {
        const context = this.context(fixture, session, module, uiCalls, notificationCalls, pi, event);
        await this.fixtureAdapter.materializeEvent(event, context);
        await this.fixtureAdapter.invokeEvent(event, context);
        frames.push(this.capture(frames.length, event, fixture, context));
      }
      const finalContext = this.context(fixture, session, module, uiCalls, notificationCalls, pi);
      const observed = this.observe(finalContext);
      return { frames, ui: observed.ui, recovery: observed.recovery, uiCalls: [...uiCalls], notifications: [...notificationCalls] };
    } finally {
      session.dispose();
      removeUiBoundary();
    }
  }

  private context(
    fixture: Fixture, session: TestSessionLike, module: Record<string, unknown>, uiCalls: SutUiCall[],
    notificationCalls: SutUiCall[], pi: unknown, event?: FixtureEvent,
  ): SutObservationContext {
    return { config: this.config, fixture, cwd: this.config.cwd, uiCalls, notificationCalls, module, session: session.session, pi, event };
  }

  private capture(index: number, event: FixtureEvent, fixture: Fixture, context: SutObservationContext): ReplayFrame {
    const observed = this.observe(context);
    return {
      index,
      timeMs: event.at,
      cause: causeFor(event),
      viewport: this.options.viewport ?? fixture.viewport,
      theme: this.options.theme ?? fixture.theme,
      ui: observed.ui,
      recovery: observed.recovery,
    };
  }

  private observe(context: SutObservationContext): { ui: UIState; recovery: RecoveryState } {
    const external = this.fixtureAdapter.observe(context);
    return { ui: mapUi(context.uiCalls, context.notificationCalls, external.ui, this.now), recovery: external.recovery };
  }

  private async loadHarness(): Promise<HarnessLike> {
    if (this.options.harness) return this.options.harness;
    const loaded = await import('@gaodes/pi-test-harness');
    return { createTestSession: loaded.createTestSession } as unknown as HarnessLike;
  }

  private async loadModule(): Promise<Record<string, unknown>> {
    if (this.options.moduleLoader) return this.options.moduleLoader(resolve(this.config.cwd, this.config.modulePath));
    const loaded = await import(/* @vite-ignore */ toModuleSpecifier(resolve(this.config.cwd, this.config.modulePath)));
    return loaded as unknown as Record<string, unknown>;
  }
}

function validateConfig(config: ExternalSutConfig): ExternalSutConfig {
  if (!config || typeof config !== 'object') throw new Error('External SUT config must be an object');
  for (const key of ['extensionPath', 'modulePath', 'cwd'] as const) {
    const value = config[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`External SUT ${key} must not be empty`);
  }
  return { ...config };
}

function toModuleSpecifier(path: string): string {
  return pathToFileURL(path).href;
}

function installUiBoundary(pi: unknown, session: TestSessionLike): void {
  const globals = globalThis as Record<string, unknown>;
  globals.__piSubagenturaPiRef = pi;
  const ui = session.events.ui;
  globals.__piSubagenturaUi = createUiFacade(ui);
}
function removeUiBoundary(): void {
  const globals = globalThis as Record<string, unknown>;
  delete globals.__piSubagenturaPiRef;
  delete globals.__piSubagenturaUi;
}
function createUiFacade(calls: Array<{ method: string; args: unknown[] }>): Record<string, (...args: unknown[]) => void> {
  const record = (method: string) => (...args: unknown[]) => calls.push({ method, args });
  return { setStatus: record('setStatus'), setWidget: record('setWidget') };
}

function mapUi(calls: SutUiCall[], notificationCalls: SutUiCall[], base: UIState, now: () => number): UIState {
  const ui: UIState = { footer: { ...base.footer }, widgets: [...base.widgets], notifications: [...base.notifications], toolRenders: [...base.toolRenders] };
  let notificationIndex = ui.notifications.length;
  for (const call of calls) {
    if (call.method === 'setStatus') mapStatus(ui, call.args);
    if (call.method === 'setWidget') mapWidget(ui, call.args);
    if (call.method === 'notify') addNotification(ui, call.args, notificationIndex++, now());
  }
  for (const call of notificationCalls) addNotification(ui, call.args, notificationIndex++, now());
  return ui;
}
function mapStatus(ui: UIState, args: unknown[]): void {
  const key = args[0];
  if (key !== 'subagentura-running') return;
  const text = typeof args[1] === 'string' ? args[1] : undefined;
  const match = text?.match(/(\d+) sub-agent/);
  ui.footer = { ...ui.footer, status: text ? 'running' : 'stale', activeAgents: match ? Number(match[1]) : 0 };
}
function mapWidget(ui: UIState, args: unknown[]): void {
  if (args[0] !== 'subagentura-activity') return;
  const content = args[1];
  const rows = Array.isArray(content) ? content.filter((row): row is string => typeof row === 'string') : [];
  ui.widgets = [{ id: String(args[0]), label: 'subagentura-activity', rows, visible: content !== undefined }];
}
function addNotification(ui: UIState, args: unknown[], index: number, timestamp: number): void {
  const message = notificationMessage(args[0]);
  const kind = notificationKind(args[1]);
  ui.notifications.push({ id: `external-${index}`, kind, message, timestamp, dismissed: false });
}
function notificationMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'content' in value && typeof value.content === 'string') return value.content;
  return JSON.stringify(value);
}
function notificationKind(value: unknown): NotificationState['kind'] {
  if (value === 'error' || value === 'warning' || value === 'success') return value;
  return 'info';
}
function causeFor(event: FixtureEvent): ReplayFrame['cause'] {
  if (event.type === 'poll') return 'poll';
  if (event.type === 'reload') return 'reload';
  if (event.type === 'resize') return 'resize';
  if (event.type === 'theme_changed') return 'theme_change';
  return 'fixture_event';
}
