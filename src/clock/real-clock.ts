// =============================================================================
// RealClock — wall-clock implementation of the Clock interface
// =============================================================================

import type { Clock, TimerHandle } from '../types.js';

let nextId = 1;
const handles = new Map<number, ReturnType<typeof setTimeout>>();

export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }

  setTimeout(callback: () => void, delayMs: number): TimerHandle {
    const id = nextId++;
    const native = globalThis.setTimeout(() => {
      handles.delete(id);
      callback();
    }, delayMs);
    handles.set(id, native);
    return { id };
  }

  clearTimeout(handle: TimerHandle): void {
    const native = handles.get(handle.id);
    if (native !== undefined) {
      globalThis.clearTimeout(native);
      handles.delete(handle.id);
    }
  }
}

export function createRealClock(): RealClock {
  return new RealClock();
}
