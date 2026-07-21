import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ScopedExternalRuntimeController } from '../process/scoped-virtual-clock.js';
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
  private readonly notificationTimestamps: number[] = [];

  constructor(config: ExternalSutConfig, options: PiHarnessSutAdapterOptions = {}) {
    this.config = validateConfig(config);
    this.options = options;
    this.fixtureAdapter = options.fixtureAdapter ?? createPiSubagenturaAdapter();
    this.now = options.now ?? Date.now;
  }

  async run(fixture: Fixture): Promise<SutObserverResult> {
    this.notificationTimestamps.length = 0;
    const initialTime = fixture.timeline[0]?.at ?? this.now();
    const runtime = new ScopedExternalRuntimeController(initialTime);
    let session: TestSessionLike | undefined;
    let restoreUiBoundary: (() => void) | undefined;
    runtime.install();
    const restoreExternalGlobals = installExternalGlobalsBoundary();
    try {
      const harness = await this.loadHarness();
      const module = await this.loadModule();
      session = await harness.createTestSession({
        extensions: [resolve(this.config.cwd, this.config.extensionPath)],
        cwd: this.config.cwd,
        mockUI: {},
      });
      const uiCalls = session.events.ui as SutUiCall[];
      uiCalls.length = 0;
      const notificationCalls: SutUiCall[] = [];
      const pi = { sendMessage: (...args: unknown[]) => notificationCalls.push({ method: 'sendMessage', args }) };
      restoreUiBoundary = installUiBoundary(pi, session);

      // Drain any in-flight extension poll cycle from a prior adapter run before
      // capturing frames. Some extension pollers are async and can outlive the
      // virtual-clock scope, so this prevents stale state from leaking into the
      // next fixture run. Session-starting fixtures drive extension startup from
      // a clean boundary, so we skip this drain there to keep startup order
      // stable for tests and callers that assert no pre-run poller calls.
      if (fixture.timeline[0]?.type !== 'session_start') {
        await flushInFlightPoller(module, pi);
      }

      const frames: ReplayFrame[] = [];
      for (const event of fixture.timeline) {
        runtime.moveTo(event.at);
        const context = this.context(fixture, session, module, uiCalls, notificationCalls, pi, event, runtime);
        await this.fixtureAdapter.materializeEvent(event, context);
        await this.fixtureAdapter.invokeEvent(event, context);
        runtime.advanceTo(event.at);
        frames.push(this.capture(frames.length, event, fixture, context));
      }
      const finalEvent = fixture.timeline.at(-1);
      const finalContext = this.context(fixture, session, module, uiCalls, notificationCalls, pi, finalEvent, runtime);
      const observed = this.observe(finalContext);
      return {
        frames,
        ui: observed.ui,
        recovery: observed.recovery,
        uiCalls: dedupeConsecutiveUiCalls(uiCalls),
        notifications: [...notificationCalls],
      };
    } finally {
      try {
        restoreUiBoundary?.();
      } finally {
        try {
          session?.dispose();
        } finally {
          try {
            restoreExternalGlobals();
          } finally {
            runtime.restore();
          }
        }
      }
    }
  }

  private context(
    fixture: Fixture, session: TestSessionLike, module: Record<string, unknown>, uiCalls: SutUiCall[],
    notificationCalls: SutUiCall[], pi: unknown, event: FixtureEvent | undefined,
    runtime: ScopedExternalRuntimeController,
  ): SutObservationContext {
    const timestamp = event?.at ?? this.now();
    return {
      config: this.config, fixture, cwd: this.config.cwd, uiCalls, notificationCalls, module,
      session: session.session, pi, event,
      withVirtualClock: (invoke) => runtime.withVirtualTime(timestamp, invoke),
      emitSessionStart: (reason = 'startup') => emitSessionStart(session, reason),
    };
  }

  private capture(index: number, event: FixtureEvent, fixture: Fixture, context: SutObservationContext): ReplayFrame {
    const observed = this.observe(context);
    return {
      index,
      timeMs: event.at,
      cause: causeFor(event),
      sequenceIds: [],
      viewport: this.options.viewport ?? fixture.viewport,
      theme: this.options.theme ?? fixture.theme,
      ui: observed.ui,
      recovery: observed.recovery,
    };
  }

  private observe(context: SutObservationContext): { ui: UIState; recovery: RecoveryState } {
    const external = this.fixtureAdapter.observe(context);
    return {
      ui: mapUi(
        context.uiCalls, context.notificationCalls, external.ui,
        notificationTime(context, this.now), this.notificationTimestamps,
      ),
      recovery: external.recovery,
    };
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
async function emitSessionStart(session: TestSessionLike, reason: 'startup' | 'reload' | 'resume'): Promise<void> {
  if (session.emitSessionStart) {
    await session.emitSessionStart(reason);
    return;
  }
  const runner = (session.session as {
    extensionRunner?: { emit?: (event: unknown) => unknown };
    _extensionRunner?: { emit?: (event: unknown) => unknown };
  }).extensionRunner ?? (session.session as { _extensionRunner?: { emit?: (event: unknown) => unknown } })._extensionRunner;
  if (!runner || typeof runner.emit !== 'function') {
    throw new Error('Harness session does not expose its extension event runner');
  }
  await runner.emit({ type: 'session_start', reason });
}

function installExternalGlobalsBoundary(): () => void {
  const globals = globalThis as Record<string, unknown>;
  const previous = captureUiBoundary(globals, externalRuntimeKeys());
  return () => restoreUiBoundary(globals, previous);
}
function externalRuntimeKeys(): string[] {
  return [...uiBoundaryKeys(), '__piSubagenturaInteractivePollerHandle', '__piSubagenturaInjectCount'];
}

function installUiBoundary(pi: unknown, session: TestSessionLike): () => void {
  const globals = globalThis as Record<string, unknown>;
  const previous = captureUiBoundary(globals, uiBoundaryKeys());
  globals.__piSubagenturaPiRef = pi;
  globals.__piSubagenturaUi = createUiFacade(session.events.ui);
  return () => restoreUiBoundary(globals, previous);
}
function captureUiBoundary(globals: Record<string, unknown>, keys: string[]): Map<string, PropertyDescriptor | undefined> {
  const values = new Map<string, PropertyDescriptor | undefined>();
  for (const key of keys) values.set(key, Object.getOwnPropertyDescriptor(globals, key));
  return values;
}
function restoreUiBoundary(globals: Record<string, unknown>, previous: Map<string, PropertyDescriptor | undefined>): void {
  for (const key of previous.keys()) {
    const descriptor = previous.get(key);
    if (descriptor) Object.defineProperty(globals, key, descriptor);
    else delete globals[key];
  }
}
function uiBoundaryKeys(): string[] {
  return ['__piSubagenturaPiRef', '__piSubagenturaUi'];
}
function createUiFacade(calls: Array<{ method: string; args: unknown[] }>): Record<string, (...args: unknown[]) => void> {
  const record = (method: string) => (...args: unknown[]) => calls.push({ method, args });
  return { setStatus: record('setStatus'), setWidget: record('setWidget') };
}
function notificationTime(context: SutObservationContext, now: () => number): number {
  return context.event?.at ?? now();
}

function mapUi(
  calls: SutUiCall[], notificationCalls: SutUiCall[], base: UIState, timestamp: number, timestamps: number[],
): UIState {
  const ui: UIState = { footer: { ...base.footer }, widgets: [...base.widgets], notifications: [...base.notifications], toolRenders: [...base.toolRenders] };
  let notificationIndex = ui.notifications.length;
  let lastSetStatusCall = '::init::';
  let lastSetWidgetCall = '::init::';
  for (const call of calls) {
    const normalizedCall = { ...call, args: normalizeCallArgs(call) };
    if (call.method === 'setStatus') {
      const signature = callSignature(normalizedCall);
      if (signature !== lastSetStatusCall) {
        mapStatus(ui, normalizedCall.args);
        lastSetStatusCall = signature;
      }
      continue;
    }
    if (call.method === 'setWidget') {
      const signature = callSignature(normalizedCall);
      if (signature !== lastSetWidgetCall) {
        mapWidget(ui, normalizedCall.args);
        lastSetWidgetCall = signature;
      }
      continue;
    }
    if (call.method === 'notify') {
      const normalizedNotify = { ...call, args: normalizeCallArgs(call) };
      const index = notificationIndex++;
      addNotification(ui, normalizedNotify.args, index, timestamps[index] ??= timestamp);
    }
  }
  for (const call of notificationCalls) {
    const normalizedCall = { ...call, args: normalizeCallArgs(call) };
    const index = notificationIndex++;
    addNotification(ui, normalizedCall.args, index, timestamps[index] ??= timestamp);
  }
  return ui;
}

function callSignature(call: SutUiCall): string {
  return `${call.method}:${JSON.stringify(normalizeCallArgs(call))}`;
}

function dedupeConsecutiveUiCalls(calls: SutUiCall[]): SutUiCall[] {
  const deduped: SutUiCall[] = [];
  let previousSignature = '::init::';
  for (const call of calls) {
    const signature = callSignature(call);
    if (signature === previousSignature) continue;
    deduped.push(call);
    previousSignature = signature;
  }
  return deduped;
}

function normalizeCallArgs(call: SutUiCall): unknown[] {
  return call.args.map((value) => {
    if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? stripAnsi(item) : item);
    if (typeof value === 'string') return stripAnsi(value);
    return value;
  });
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
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
  if (typeof value === 'string') return stripAnsi(value);
  if (value && typeof value === 'object' && 'content' in value && typeof value.content === 'string') return stripAnsi(value.content);
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

async function flushInFlightPoller(module: Record<string, unknown>, pi: unknown): Promise<void> {
  const poller = (module as { pollArtifactChanges?: (pi: unknown) => unknown }).pollArtifactChanges;
  if (typeof poller !== 'function') return;
  try {
    await poller(pi);
  } catch {
    /* ignore poller failures during pre-run drain */
  }
}
