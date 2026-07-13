// =============================================================================
// Text extractor tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { extractText } from '../capture/text-extractor.js';

describe('extractText', () => {
  it('returns plain text unchanged', () => {
    expect(extractText('Hello World')).toBe('Hello World');
  });

  it('strips CSI sequences', () => {
    expect(extractText('\x1b[31mRed\x1b[0m')).toBe('Red');
  });

  it('strips OSC sequences (BEL terminated)', () => {
    expect(extractText('\x1b]0;title\x07Hello')).toBe('Hello');
  });

  it('strips OSC sequences (ST terminated)', () => {
    expect(extractText('\x1b]0;title\x1b\\Hello')).toBe('Hello');
  });

  it('strips DCS sequences', () => {
    expect(extractText('\x1bPdata\x1b\\Hello')).toBe('Hello');
  });

  it('strips APC sequences', () => {
    expect(extractText('\x1b_payload\x1b\\Hello')).toBe('Hello');
  });

  it('strips PM sequences', () => {
    expect(extractText('\x1b^payload\x1b\\Hello')).toBe('Hello');
  });

  it('strips SOS sequences', () => {
    expect(extractText('\x1bXpayload\x1b\\Hello')).toBe('Hello');
  });

  it('preserves newlines', () => {
    expect(extractText('Line1\nLine2\nLine3')).toBe('Line1\nLine2\nLine3');
  });

  it('preserves carriage returns', () => {
    expect(extractText('ABC\rXYZ')).toBe('ABC\rXYZ');
  });

  it('preserves tabs', () => {
    expect(extractText('A\tB')).toBe('A\tB');
  });

  it('preserves spaces', () => {
    expect(extractText('A  B  C')).toBe('A  B  C');
  });

  it('handles complex multi-sequence strings', () => {
    const input = '\x1b[1m\x1b[31mBold Red\x1b[0m Normal \x1b[4mUnderline\x1b[0m';
    expect(extractText(input)).toBe('Bold Red Normal Underline');
  });

  it('handles empty string', () => {
    expect(extractText('')).toBe('');
  });

  it('handles string with only escape sequences', () => {
    expect(extractText('\x1b[0m\x1b[1m')).toBe('');
  });

  it('handles nested escape sequences', () => {
    const input = '\x1b[38;2;255;0;0m\x1b[1mRed Bold\x1b[0m';
    expect(extractText(input)).toBe('Red Bold');
  });
});
