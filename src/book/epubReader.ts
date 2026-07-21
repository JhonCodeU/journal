import pathNode from 'path';
import { EPub } from 'epub2';
import * as cheerio from 'cheerio';
import { BookReader } from './reader.js';
import { Book, Chapter, Paragraph, BookMetadata } from './types.js';
import { splitIntoSentences } from './splitter.js';

/**
 * EPUB book reader implementing the BookReader interface.
 *
 * Uses `epub2` (a maintained fork of `epub` with async support).
 * Preserves chapter structure, metadata (title, author, language),
 * and reading order from the spine.
 */
export class EPUBBookReader implements BookReader {
  readonly sourcePath: string;
  private meta: BookMetadata | null = null;

  constructor(sourcePath: string) {
    this.sourcePath = sourcePath;
  }

  getMetadata(): BookMetadata {
    if (this.meta) return this.meta;
    const title = pathNode.basename(this.sourcePath).replace(/\.epub$/i, '');
    this.meta = {
      title,
      author: '',
      language: 'en',
      format: 'epub',
    };
    return this.meta;
  }

  async load(): Promise<Book> {
    const epub = await EPub.createAsync(this.sourcePath);
    const meta = this.getMetadata();

    // Extract real metadata from epub if available
    if (epub.metadata?.title) {
      meta.title = epub.metadata.title;
    }
    if (epub.metadata?.creator) {
      meta.author = epub.metadata.creator;
    }
    if (epub.metadata?.language) {
      meta.language = epub.metadata.language.split('-')[0]; // 'en-US' → 'en'
    }

    const chapters: Chapter[] = [];
    const allSentences: Book['sentences'] = [];
    const sentenceToChapter: number[] = [];
    let globalIndex = 0;

    // Use spine / flow as the reading order
    const spineItems = epub.flow?.length ? epub.flow : epub.toc;
    const manifest = epub.manifest || {};

    // Build a map of href → manifest id
    const hrefToId: Record<string, string> = {};
    for (const [id, elem] of Object.entries(manifest)) {
      const item = elem as any;
      if (item.href) {
        hrefToId[item.href] = id;
      }
    }

    for (let order = 0; order < spineItems.length; order++) {
      const item: any = spineItems[order];
      const itemId = item.id || '';

      // Skip non-text items
      const mediaType = (item as any)['media-type'] || (item as any).mediaType || '';
      if (mediaType && !mediaType.includes('xhtml') && !mediaType.includes('html') && mediaType !== '') {
        continue;
      }

      let html: string;
      try {
        html = await epub.getChapterAsync(itemId);
      } catch {
        // Try reading via manifest href directly
        const href = item.href;
        if (!href) continue;
        const matchedId = hrefToId[href];
        if (!matchedId) continue;
        try {
          html = await epub.getChapterAsync(matchedId);
        } catch {
          continue;
        }
      }

      if (!html || html.trim().length < 20) continue;

      // Parse HTML with cheerio to extract clean text
      const $ = cheerio.load(html);

      // Remove non-content elements
      $('script, style, nav, header, footer, aside, svg, img, figure, noscript').remove();

      const chapterTitle = item.title || `Chapter ${order + 1}`;

      // Extract paragraphs from block elements
      const paragraphs: Paragraph[] = [];
      const paragraphElements: string[] = [];

      $('p, div, blockquote, li, h1, h2, h3, h4, h5, h6').each((_: any, el: any) => {
        const text = $(el).text().trim();
        if (text.length >= 20) {
          paragraphElements.push(text);
        }
      });

      // Fallback: if no rich structure, use the body text split by double newlines
      if (paragraphElements.length === 0) {
        const bodyText = $('body').text().trim();
        const blocks = bodyText.split(/\n\s*\n/);
        for (const block of blocks) {
          const t = block.replace(/\s+/g, ' ').trim();
          if (t.length >= 20) {
            paragraphElements.push(t);
          }
        }
      }

      let chapterSentenceCount = 0;

      for (const paraText of paragraphElements) {
        const sentences = splitIntoSentences(paraText);
        if (sentences.length === 0) continue;

        paragraphs.push({
          text: paraText,
          sentences,
        });

        for (const sentence of sentences) {
          allSentences.push({
            text: sentence,
            chapterIndex: chapters.length,
            globalIndex,
          });
          sentenceToChapter.push(chapters.length);
          globalIndex++;
          chapterSentenceCount++;
        }
      }

      if (paragraphs.length === 0) continue;

      chapters.push({
        id: itemId || `chapter-${order}`,
        title: chapterTitle,
        order,
        paragraphs,
        sentenceCount: chapterSentenceCount,
        startSentenceIndex: globalIndex - chapterSentenceCount,
      });
    }

    return {
      id: this.sourcePath,
      title: meta.title,
      author: meta.author,
      language: meta.language,
      format: 'epub',
      sourcePath: this.sourcePath,
      totalChapters: chapters.length,
      totalSentences: allSentences.length,
      chapters,
      sentences: allSentences,
      sentenceToChapter,
    };
  }
}
