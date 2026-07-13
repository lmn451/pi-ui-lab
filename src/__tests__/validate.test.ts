import { describe, it, expect } from 'vitest';
import { validateFixture } from '../schema/validate.js';

const validFixture = {
  version: 1,
  name: 'test-fixture',
  viewport: { cols: 80, rows: 24 },
  theme: 'dark',
  pollIntervalMs: 1000,
  timeline: [
    { at: 0, type: 'session_start' },
    { at: 100, type: 'activity', agentId: 'agent-1' },
    { at: 200, type: 'checkpoint', name: 'checkpoint-1' },
  ],
};

describe('validateFixture', () => {
  it('validates a correct fixture', () => {
    const result = validateFixture(validFixture);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('rejects missing required fields', () => {
    const data = { version: 1 };
    const result = validateFixture(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('rejects version !== 1', () => {
    const data = { ...validFixture, version: 2 };
    const result = validateFixture(data);
    expect(result.valid).toBe(false);
  });

  it('rejects viewport cols out of range', () => {
    const data = {
      ...validFixture,
      viewport: { cols: 10, rows: 24 },
    };
    const result = validateFixture(data);
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.includes('cols'))).toBe(true);
  });

  it('rejects viewport rows out of range', () => {
    const data = {
      ...validFixture,
      viewport: { cols: 80, rows: 2 },
    };
    const result = validateFixture(data);
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.includes('rows'))).toBe(true);
  });

  it('rejects pollIntervalMs below minimum', () => {
    const data = { ...validFixture, pollIntervalMs: 50 };
    const result = validateFixture(data);
    expect(result.valid).toBe(false);
  });

  it('rejects unknown event types', () => {
    const data = {
      ...validFixture,
      timeline: [{ at: 0, type: 'unknown_event' }],
    };
    const result = validateFixture(data);
    expect(result.valid).toBe(false);
  });

  it('accepts optional description', () => {
    const data = { ...validFixture, description: 'A test' };
    const result = validateFixture(data);
    expect(result.valid).toBe(true);
  });

  it('accepts empty timeline', () => {
    const data = { ...validFixture, timeline: [] };
    const result = validateFixture(data);
    expect(result.valid).toBe(true);
  });
});
