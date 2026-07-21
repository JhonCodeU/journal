/**
 * BookReader interface.
 *
 * All book format readers (PDF, EPUB, future TXT) implement this interface.
 * The rest of the application never knows the source format.
 */

import { Book, BookMetadata } from './types.js';

export interface BookReaderProgress {
  currentSentence: number;
  currentChapter: number;
}

export interface BookReader {
  /** Full path to the source file */
  readonly sourcePath: string;

  /** Load and parse the book. Returns the structured Book model. */
  load(): Promise<Book>;

  /** Return stable metadata without parsing the full book. */
  getMetadata(): BookMetadata;
}
