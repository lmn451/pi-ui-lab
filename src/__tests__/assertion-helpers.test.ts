import { describe, it, expect } from 'vitest';
import { pass, fail } from '../assertions/types.js';
import type { AssertionResult } from '../assertions/types.js';

// ---------------------------------------------------------------------------
// AssertionResult formatting
// ---------------------------------------------------------------------------
describe('AssertionResult formatting', () => {
  it('pass() returns a passing result', () => {
    const result = pass('ok');
    expect(result.pass).toBe(true);
    expect(result.message).toBe('ok');
    expect(result.actual).toBeUndefined();
    expect(result.expected).toBeUndefined();
  });

  it('pass() includes actual and expected when provided', () => {
    const result = pass('match', 42, 42);
    expect(result.actual).toBe(42);
    expect(result.expected).toBe(42);
  });

  it('fail() returns a failing result', () => {
    const result = fail('nope');
    expect(result.pass).toBe(false);
    expect(result.message).toBe('nope');
  });

  it('fail() includes actual and expected', () => {
    const result = fail('mismatch', 'actual', 'expected');
    expect(result.actual).toBe('actual');
    expect(result.expected).toBe('expected');
  });

  it('diff field is optional', () => {
    const result: AssertionResult = pass('ok');
    expect(result.diff).toBeUndefined();
  });

  it('diff can be set', () => {
    const result: AssertionResult = {
      pass: false,
      message: 'diff test',
      diff: '- expected\n+ actual',
    };
    expect(result.diff).toBe('- expected\n+ actual');
  });
});

// ---------------------------------------------------------------------------
// Matcher utilities (NotificationMatcher / ArtifactEventMatcher)
// ---------------------------------------------------------------------------
describe('Matcher utilities', () => {
  it('NotificationMatcher kind filter works', () => {
    const notifications = [
      { id: '1', kind: 'info' as const, message: 'a', timestamp: 1, dismissed: false },
      { id: '2', kind: 'error' as const, message: 'b', timestamp: 2, dismissed: false },
    ];
    const match = notifications.find(n => n.kind === 'error');
    expect(match?.id).toBe('2');
  });

  it('NotificationMatcher messageContains filter works', () => {
    const notifications = [
      { id: '1', kind: 'info' as const, message: 'Operation complete', timestamp: 1, dismissed: false },
    ];
    const match = notifications.find(n => n.message.includes('complete'));
    expect(match?.id).toBe('1');
  });

  it('ArtifactEventMatcher type filter works', () => {
    const events = [
      { id: '1', type: 'created', timestamp: 100 },
      { id: '2', type: 'updated', timestamp: 200 },
    ];
    const match = events.find(e => e.type === 'updated');
    expect(match?.id).toBe('2');
  });

  it('ArtifactEventMatcher afterTimestamp filter works', () => {
    const events = [
      { id: '1', type: 'created', timestamp: 100 },
      { id: '2', type: 'created', timestamp: 300 },
    ];
    const match = events.find(e => e.timestamp > 150);
    expect(match?.id).toBe('2');
  });
});
