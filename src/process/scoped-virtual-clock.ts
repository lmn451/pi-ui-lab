type IntervalCallback = (...args: unknown[]) => unknown;
type IntervalHandle = ReturnType<typeof setInterval>;
type GlobalTimers = {
  Date: DateConstructor;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
};

type CapturedInterval = {
  callback: IntervalCallback;
  args: unknown[];
  intervalMs: number;
  nextFireAt: number;
  order: number;
};

let activeScope: ScopedExternalRuntimeController | undefined;

function activateScope(scope: ScopedExternalRuntimeController): void {
  activeScope = scope;
}

/** Captures production intervals and replays them against fixture time. */
export class ScopedExternalRuntimeController {
  private readonly globals: GlobalTimers = globalThis as unknown as GlobalTimers;
  private readonly nowDescriptor = Object.getOwnPropertyDescriptor(Date, 'now');
  private readonly setIntervalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setInterval');
  private readonly clearIntervalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'clearInterval');
  private readonly originalClearInterval = this.globals.clearInterval;
  private readonly intervals = new Map<object, CapturedInterval>();
  private currentTime: number;
  private nextOrder = 0;
  private installed = false;
  private invoking = false;

  constructor(initialTimeMs: number) {
    validateTime(initialTimeMs);
    this.currentTime = initialTimeMs;
  }

  install(): void {
    if (this.installed) throw new Error('Virtual clock scope is already active');
    if (activeScope) throw new Error('Concurrent virtual clock scopes are unsafe');
    activateScope(this);
    this.installed = true;
    try {
      Object.defineProperty(Date, 'now', { ...this.nowDescriptor, value: () => this.currentTime });
      Object.defineProperty(globalThis, 'setInterval', {
        ...this.setIntervalDescriptor,
        value: this.captureInterval.bind(this),
      });
      Object.defineProperty(globalThis, 'clearInterval', {
        ...this.clearIntervalDescriptor,
        value: this.clearInterval.bind(this),
      });
    } catch (error) {
      this.restore();
      throw error;
    }
  }

  restore(): void {
    if (!this.installed) return;
    let restoreError: unknown;
    try {
      restoreProperty(Date, 'now', this.nowDescriptor);
    } catch (error) {
      restoreError = error;
    }
    try {
      restoreProperty(globalThis, 'setInterval', this.setIntervalDescriptor);
    } catch (error) {
      restoreError ??= error;
    }
    try {
      restoreProperty(globalThis, 'clearInterval', this.clearIntervalDescriptor);
    } catch (error) {
      restoreError ??= error;
    } finally {
      this.intervals.clear();
      this.installed = false;
      if (activeScope === this) activeScope = undefined;
    }
    if (restoreError) throw restoreError;
  }

  /** Moves fixture time without replaying captured intervals. */
  moveTo(timeMs: number): void {
    this.assertInstalled();
    validateTime(timeMs);
    if (timeMs < this.currentTime) throw new Error('Virtual clock cannot move backwards');
    this.currentTime = timeMs;
  }

  /** Runs a synchronous callback at a fixture timestamp without replaying timers. */
  withVirtualTime<T>(timeMs: number, invoke: () => T): T {
    this.assertInstalled();
    validateTime(timeMs);
    if (this.invoking) throw new Error('Nested virtual clock scopes are unsafe');
    const previousTime = this.currentTime;
    this.currentTime = timeMs;
    try {
      return this.invokeSync(invoke);
    } finally {
      this.currentTime = previousTime;
    }
  }

  /** Replays every captured interval due at or before the target fixture time. */
  advanceTo(timeMs: number): void {
    this.assertInstalled();
    validateTime(timeMs);
    if (timeMs < this.currentTime) throw new Error('Virtual clock cannot move backwards');
    try {
      while (true) {
        const next = this.nextDue(timeMs);
        if (!next) return;
        this.currentTime = next.nextFireAt;
        next.nextFireAt += next.intervalMs;
        this.invokeSync(() => next.callback(...next.args));
      }
    } finally {
      this.currentTime = timeMs;
    }
  }

  private captureInterval(callback: IntervalCallback, delay?: number, ...args: unknown[]): IntervalHandle {
    if (typeof callback !== 'function') throw new TypeError('setInterval callback must be a function');
    const intervalMs = normalizeInterval(delay);
    const handle = createHandle() as IntervalHandle;
    this.intervals.set(handle as object, {
      callback,
      args,
      intervalMs,
      nextFireAt: this.currentTime + intervalMs,
      order: this.nextOrder++,
    });
    return handle;
  }

  private clearInterval(handle: IntervalHandle | undefined): void {
    if (handle && this.intervals.delete(handle as object)) return;
    this.originalClearInterval(handle);
  }

  private nextDue(targetTime: number): CapturedInterval | undefined {
    return [...this.intervals.values()]
      .filter((interval) => interval.nextFireAt <= targetTime)
      .sort((left, right) => left.nextFireAt - right.nextFireAt || left.order - right.order)[0];
  }

  private invokeSync<T>(invoke: () => T): T {
    if (this.invoking) throw new Error('Nested virtual clock scopes are unsafe');
    this.invoking = true;
    try {
      const result = invoke();
      if (isThenable(result)) throw new Error('Virtual clock scope requires a synchronous invocation');
      return result;
    } finally {
      this.invoking = false;
    }
  }

  private assertInstalled(): void {
    if (!this.installed || activeScope !== this) throw new Error('Virtual clock scope is not active');
  }
}

/** Runs synchronous external production code with Date.now pinned to fixture time. */
export function withVirtualDateNow<T>(timeMs: number, invoke: () => T): T {
  const controller = new ScopedExternalRuntimeController(timeMs);
  controller.install();
  try {
    return controller.withVirtualTime(timeMs, invoke);
  } finally {
    controller.restore();
  }
}

function createHandle(): object {
  return { unref: () => undefined, ref: () => undefined, hasRef: () => false };
}

function restoreProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

function validateTime(timeMs: number): void {
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('Virtual clock time must be a non-negative finite number');
}

function normalizeInterval(delay: number | undefined): number {
  if (delay === undefined || !Number.isFinite(delay) || delay <= 0) return 1;
  return Math.floor(delay);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return !!value && (typeof value === 'object' || typeof value === 'function') && 'then' in value;
}
