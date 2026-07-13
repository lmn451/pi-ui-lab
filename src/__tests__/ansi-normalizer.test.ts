// =============================================================================
// ANSI normalizer tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { normalizeAnsi } from '../capture/ansi-normalizer.js';

describe('normalizeAnsi', () => {
  it('preserves plain text', () => {
    expect(normalizeAnsi('Hello World')).toBe('Hello World');
  });

  it('preserves SGR sequences', () => {
    const input = '\x1b[31mRed\x1b[0m';
    const result = normalizeAnsi(input);
    expect(result).toContain('Red');
    expect(result).toContain('\x1b[31m');
  });

  it('removes cursor movement sequences', () => {
    const input = '\x1b[5;10HHello\x1b[0m';
    const result = normalizeAnsi(input);
    expect(result).toBe('Hello');
  });

  it('removes erase sequences', () => {
    const input = 'HELLO\x1b[2K';
    const result = normalizeAnsi(input);
    expect(result).toBe('HELLO');
  });

  it('normalizes CRLF to LF', () => {
    const input = 'Line1\r\nLine2';
    const result = normalizeAnsi(input);
    expect(result).toBe('Line1\nLine2');
  });

  it('normalizes CR to LF', () => {
    const input = 'Line1\rLine2';
    const result = normalizeAnsi(input);
    expect(result).toBe('Line1\nLine2');
  });

  it('strips trailing whitespace per line', () => {
    const input = 'Hello   \nWorld   ';
    const result = normalizeAnsi(input);
    expect(result).toBe('Hello\nWorld');
  });

  it('deduplicates redundant reset sequences', () => {
    const input = '\x1b[0m\x1b[0m\x1b[0mText';
    const result = normalizeAnsi(input);
    expect(result).toBe('Text');
  });

  it('removes leading reset', () => {
    const input = '\x1b[0m\x1b[31mRed';
    const result = normalizeAnsi(input);
    expect(result).toBe('\x1b[31mRed');
  });

  it('removes trailing reset', () => {
    const input = '\x1b[31mRed\x1b[0m';
    const result = normalizeAnsi(input);
    expect(result).toBe('\x1b[31mRed');
  });

  it('converts true-color to 256-color', () => {
    const input = '\x1b[38;2;255;0;0mRed';
    const result = normalizeAnsi(input);
    expect(result).toContain('\x1b[38;5;');
    expect(result).not.toContain('38;2;');
  });

  it('preserves text content', () => {
    const input = '\x1b[1m\x1b[31mBold Red\x1b[0m Normal';
    const result = normalizeAnsi(input);
    expect(result).toContain('Bold Red');
    expect(result).toContain('Normal');
  });
});
