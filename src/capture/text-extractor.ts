// =============================================================================
// Extract plain text from ANSI output
// =============================================================================

/** Remove terminal control sequences while preserving printable text controls. */
export function extractText(ansi: string): string {
  let result = '';
  let index = 0;
  while (index < ansi.length) {
    const char = ansi[index];
    if (char !== '\x1b') {
      const code = ansi.charCodeAt(index);
      if (code >= 0x20 || char === '\n' || char === '\r' || char === '\t' || char === '\b') result += char;
      index++;
      continue;
    }
    const next = ansi[index + 1];
    if (next === '[') {
      let end = index + 2;
      while (end < ansi.length && ansi.charCodeAt(end) >= 0x30 && ansi.charCodeAt(end) <= 0x3f) end++;
      while (end < ansi.length && ansi.charCodeAt(end) >= 0x20 && ansi.charCodeAt(end) <= 0x2f) end++;
      index = end < ansi.length ? end + 1 : end;
    } else if (next === ']' || next === 'P' || next === '_' || next === '^' || next === 'X') {
      index += 2;
      while (index < ansi.length && ansi[index] !== '\x07' && !(ansi[index] === '\x1b' && ansi[index + 1] === '\\')) index++;
      if (ansi[index] === '\x07') index++;
      else if (ansi[index] === '\x1b') index += 2;
    } else if (next === '\x1b') {
      index += 1;
    } else {
      // A two-byte ESC sequence (for example ESC 7) has no printable payload.
      index += Math.min(2, ansi.length - index);
    }
  }
  return result;
}
