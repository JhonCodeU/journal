/**
 * Core book model types.
 *
 * A Book is composed of Chapters → Paragraphs → Sentences.
 * For easy iteration, a flat `sentences[]` array is also built.
 */

export interface Book {
  id: string;
  title: string;
  author: string;
  language: string;
  format: 'pdf' | 'epub';
  sourcePath: string;
  totalChapters: number;
  totalSentences: number;
  chapters: Chapter[];
  /** Flat list of all sentences across all chapters (for sequential reading) */
  sentences: Sentence[];
  /** Maps a global sentence index → chapter index */
  sentenceToChapter: number[];
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
  paragraphs: Paragraph[];
  /** Total sentences in this chapter */
  sentenceCount: number;
  /** Global sentence index where this chapter starts */
  startSentenceIndex: number;
}

export interface Paragraph {
  text: string;
  sentences: string[];
}

export interface Sentence {
  text: string;
  chapterIndex: number;
  globalIndex: number;
}

export interface BookMetadata {
  title: string;
  author: string;
  language: string;
  format: 'pdf' | 'epub';
}
