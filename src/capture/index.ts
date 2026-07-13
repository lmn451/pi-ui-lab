// =============================================================================
// Terminal capture system – barrel export
// =============================================================================

export { parseAnsi, parseAnsiDetailed, charWidth } from './ansi-parser.js';
export type { AnsiParseResult } from './ansi-parser.js';
export {
  assertViewport,
  createEmptyGrid,
  gridToText,
  gridsEqual,
  cloneGrid,
  getCell,
  setCell,
  resizeGrid,
  resizeCellGrid,
  gridViewport,
  clearCell,
} from './cell-grid.js';
export { detectOverflow, detectCollisions } from './overflow-detector.js';
export type { CollisionReport } from './overflow-detector.js';
export { trackCursor } from './cursor-tracker.js';
export { extractText } from './text-extractor.js';
export { normalizeAnsi } from './ansi-normalizer.js';
export { renderSvg, generateSvg, gridToSvg } from './svg-renderer.js';
export type { SvgOptions } from './svg-renderer.js';
export {
  generatePng,
  renderPng,
  isPngAvailable,
  getPngBackendStatus,
  PngBackendUnavailableError,
} from './png-adapter.js';
export type { PngBackendStatus, PngOptions } from './png-adapter.js';
export { captureAnsi, captureTerminal, resizeCapture } from './terminal-capture.js';
