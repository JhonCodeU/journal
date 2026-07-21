import fs from 'fs';
import pathNode from 'path';
import { PDFParse } from 'pdf-parse';
import { BookReader, BookReaderProgress } from './reader.js';
import { Book, Chapter, Paragraph, BookMetadata } from './types.js';
import { splitIntoSentences } from './splitter.js';

/**
 * PDF book reader implementing the BookReader interface.
 */
export class PDFBookReader implements BookReader {
  readonly sourcePath: string;
  private meta: BookMetadata | null = null;

  constructor(sourcePath: string) {
    this.sourcePath = sourcePath;
  }

  getMetadata(): BookMetadata {
    if (this.meta) return this.meta;
    const title = pathNode.basename(this.sourcePath).replace(/\.pdf$/i, '');
    this.meta = {
      title,
      author: '',
      language: 'en',
      format: 'pdf',
    };
    return this.meta;
  }

  async load(): Promise<Book> {
    const dataBuffer = fs.readFileSync(this.sourcePath);
    const parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();

    const meta = this.getMetadata();
    const rawPages = data.pages || [];

    // Merge all pages into one text block
    const fullText = rawPages
      .map((p: any) => p.text)
      .join('\n\n')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Parse into a single chapter (PDFs don't have native chapter structure)
    const sentences = splitIntoSentences(fullText);
    const bookId = this.sourcePath;

    const paragraphs: Paragraph[] = [];
    // Split sentences into paragraphs of ~3-5 sentences each
    for (let i = 0; i < sentences.length; i += 4) {
      const chunk = sentences.slice(i, i + 4);
      paragraphs.push({
        text: chunk.join(' '),
        sentences: chunk,
      });
    }

    const chapter: Chapter = {
      id: 'chapter-1',
      title: meta.title,
      order: 1,
      paragraphs,
      sentenceCount: sentences.length,
      startSentenceIndex: 0,
    };

    const bookSentences = sentences.map((text, i) => ({
      text,
      chapterIndex: 0,
      globalIndex: i,
    }));

    return {
      id: bookId,
      title: meta.title,
      author: meta.author,
      language: meta.language,
      format: 'pdf',
      sourcePath: this.sourcePath,
      totalChapters: 1,
      totalSentences: sentences.length,
      chapters: [chapter],
      sentences: bookSentences,
      sentenceToChapter: new Array(sentences.length).fill(0),
    };
  }
}
