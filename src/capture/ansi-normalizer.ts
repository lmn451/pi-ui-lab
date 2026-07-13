// =============================================================================
// Normalize ANSI output for stable comparison
// =============================================================================

function rgbTo256(red: number, green: number, blue: number): number {
  const r = Math.max(0, Math.min(255, red));
  const g = Math.max(0, Math.min(255, green));
  const b = Math.max(0, Math.min(255, blue));
  if (Math.max(r, g, b) - Math.min(r, g, b) < 10) {
    if (r <= 8) return 0;
    if (r >= 248) return 15;
    return Math.max(232, Math.min(255, 232 + Math.round((r - 8) / 10)));
  }
  return 16 + Math.round(r / 51) * 36 + Math.round(g / 51) * 6 + Math.round(b / 51);
}

function normalizeSgr(raw: string): string {
  const body = raw === '' ? [0] : raw.split(';').map((part) => Number.parseInt(part, 10) || 0);
  const output: number[] = [];
  for (let index = 0; index < body.length; index++) {
    const value = body[index];
    if ((value === 38 || value === 48) && body[index + 1] === 2 && body[index + 4] !== undefined) {
      output.push(value, 5, rgbTo256(body[index + 2], body[index + 3], body[index + 4]));
      index += 4;
    } else output.push(value);
  }
  if (output.length === 0 || output.every((value) => value === 0)) return '\x1b[0m';
  return `\x1b[${output.join(';')}m`;
}

/** Normalize terminal controls while retaining canonical SGR styling. */
export function normalizeAnsi(ansi: string): string {
  const input = ansi.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let output = '';
  let index = 0;
  while (index < input.length) {
    if (input[index] !== '\x1b') { output += input[index++]; continue; }
    const next = input[index + 1];
    if (next === '[') {
      let end = index + 2;
      while (end < input.length && input.charCodeAt(end) >= 0x30 && input.charCodeAt(end) <= 0x3f) end++;
      const raw = input.slice(index + 2, end);
      while (end < input.length && input.charCodeAt(end) >= 0x20 && input.charCodeAt(end) <= 0x2f) end++;
      const final = input[end];
      if (final === 'm') output += normalizeSgr(raw);
      index = end < input.length ? end + 1 : end;
    } else if (next === ']' || next === 'P' || next === '_' || next === '^' || next === 'X') {
      index += 2;
      while (index < input.length && input[index] !== '\x07' && !(input[index] === '\x1b' && input[index + 1] === '\\')) index++;
      if (input[index] === '\x07') index++;
      else if (input[index] === '\x1b') index += 2;
    } else index += Math.min(2, input.length - index);
  }
  output = output.replace(/ +(?=(?:\x1b\[[0-9;]*m)*(?:\n|$))/g, '');
  output = output.replace(/(?:\x1b\[0m)+/g, '\x1b[0m');
  while (output.startsWith('\x1b[0m')) output = output.slice(4);
  while (output.endsWith('\x1b[0m')) output = output.slice(0, -4);
  return output;
}
