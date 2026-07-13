// =============================================================================
// VirtualClock tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { VirtualClock, createVirtualClock } from '../clock/virtual-clock.js';

describe('VirtualClock', () => {
  it('starts at time 0 by default', () => {
    const clock = new VirtualClock();
    expect(clock.now()).toBe(0);
  });

  it('respects startTime option', () => {
    const clock = new VirtualClock({ startTime: 1000 });
    expect(clock.now()).toBe(1000);
  });

  describe('step()', () => {
    it('advances to next timer and executes it', () => {
      const clock = new VirtualClock();
      let fired = false;
      clock.setTimeout(() => { fired = true; }, 100);
      clock.step();
      expect(fired).toBe(true);
      expect(clock.now()).toBe(100);
    });

    it('returns current time when no timers', () => {
      const clock = new VirtualClock({ startTime: 500 });
      const t = clock.step();
      expect(t).toBe(500);
    });

    it('executes timers in order', () => {
      const clock = new VirtualClock();
      const order: number[] = [];
      clock.setTimeout(() => order.push(2), 200);
      clock.setTimeout(() => order.push(1), 100);
      clock.setTimeout(() => order.push(3), 300);

      clock.step();
      clock.step();
      clock.step();
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('advanceTo()', () => {
    it('executes all timers within the range', () => {
      const clock = new VirtualClock();
      const fired: number[] = [];
      clock.setTimeout(() => fired.push(100), 100);
      clock.setTimeout(() => fired.push(200), 200);
      clock.setTimeout(() => fired.push(500), 500);

      clock.advanceTo(250);
      expect(fired).toEqual([100, 200]);
      expect(clock.now()).toBe(250);
    });

    it('throws when going backwards', () => {
      const clock = new VirtualClock({ startTime: 500 });
      expect(() => clock.advanceTo(100)).toThrow('before current time');
    });

    it('does not execute timers past the target', () => {
      const clock = new VirtualClock();
      let fired = false;
      clock.setTimeout(() => { fired = true; }, 500);
      clock.advanceTo(100);
      expect(fired).toBe(false);
    });
  });

  describe('clearTimeout()', () => {
    it('cancels a pending timer', () => {
      const clock = new VirtualClock();
      let fired = false;
      const handle = clock.setTimeout(() => { fired = true; }, 100);
      clock.clearTimeout(handle);
      clock.step();
      expect(fired).toBe(false);
    });
  });

  describe('getPendingTimers()', () => {
    it('returns pending timers', () => {
      const clock = new VirtualClock();
      clock.setTimeout(() => {}, 100);
      clock.setTimeout(() => {}, 200);
      expect(clock.getPendingTimers()).toHaveLength(2);
    });

    it('updates after clearing', () => {
      const clock = new VirtualClock();
      const h = clock.setTimeout(() => {}, 100);
      clock.setTimeout(() => {}, 200);
      clock.clearTimeout(h);
      expect(clock.getPendingTimers()).toHaveLength(1);
    });
  });

  describe('guards', () => {
    it('throws on max steps exceeded', () => {
      const clock = new VirtualClock({ maxSteps: 3 });
      for (let i = 0; i < 4; i++) {
        clock.setTimeout(() => {}, 10);
      }
      clock.step();
      clock.step();
      clock.step();
      expect(() => clock.step()).toThrow('max steps');
    })

    it('throws on timer loop detection', () => {
      const clock = new VirtualClock();
      // Create a timer that re-registers itself at the same time
      const fireSameTime = () => {
        clock.setTimeout(() => {
          clock.setTimeout(fireSameTime, 0);
        }, 0);
      };
      clock.setTimeout(() => {
        clock.setTimeout(fireSameTime, 0);
      }, 0);

      // Run many steps — should eventually trigger loop detection
      expect(() => {
        for (let i = 0; i < 110; i++) clock.step();
      }).toThrow('timer loop');
    });
  });

  describe('reset()', () => {
    it('resets all state', () => {
      const clock = new VirtualClock();
      clock.setTimeout(() => {}, 100);
      clock.step();
      clock.reset(0);
      expect(clock.now()).toBe(0);
      expect(clock.getPendingTimers()).toHaveLength(0);
    });
  });

  describe('createVirtualClock factory', () => {
    it('returns a VirtualClock instance', () => {
      const clock = createVirtualClock();
      expect(clock).toBeInstanceOf(VirtualClock);
    });
  });
});
