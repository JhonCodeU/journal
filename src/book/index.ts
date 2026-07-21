/**
 * Book reader entry point.
 *
 * Factory helpers and shared exports.
 */

export { PDFBookReader } from './pdfReader.js';
export { EPUBBookReader } from './epubReader.js';
export { splitIntoSentences } from './splitter.js';

export * from './progress.js';

import { PDFBookReader } from './pdfReader.js';
import { EPUBBookReader } from './epubReader.js';

/**
 * Factory: create the right reader for a given file path.
 */
export function createReader(sourcePath: string) {
  const lower = sourcePath.toLowerCase();
  if (lower.endsWith('.epub')) {
    return new EPUBBookReader(sourcePath);
  }
  if (lower.endsWith('.pdf')) {
    return new PDFBookReader(sourcePath);
  }
  throw new Error(`Unsupported format: ${sourcePath}. Supported: .pdf, .epub`);
}
