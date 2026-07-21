import pathNode from 'path';
import { EPub } from 'epub2';
import * as cheerio from 'cheerio';
import { BookReader } from './reader.js';
import { Book, Chapter, Paragraph, BookMetadata } from './types.js';
import { splitIntoSentences } from './splitter.js';

export class EPUBBookReader implements BookReader {
  readonly sourcePath: string;
  private meta: BookMetadata | null = null;

  constructor(sourcePath: string) { this.sourcePath = sourcePath; }

  getMetadata(): BookMetadata {
    if (this.meta) return this.meta;
    this.meta = { title: pathNode.basename(this.sourcePath).replace(/\.epub$/i, ''), author: '', language: 'en', format: 'epub' };
    return this.meta;
  }

  async load(): Promise<Book> {
    const epub = await EPub.createAsync(this.sourcePath);
    const meta = this.getMetadata();
    if (epub.metadata?.title) meta.title = epub.metadata.title;
    if (epub.metadata?.creator) meta.author = epub.metadata.creator;
    if (epub.metadata?.language) meta.language = epub.metadata.language.split('-')[0];

    const chapters: Chapter[] = [];
    const allSentences: Book['sentences'] = [];
    const sentenceToChapter: number[] = [];
    let globalIndex = 0;
    let bodyCount = 0;

    const spineItems = epub.flow?.length ? epub.flow : epub.toc;
    const manifest = epub.manifest || {};
    const hrefToId: Record<string, string> = {};

    for (const [id, elem] of Object.entries(manifest)) {
      const item = elem as any;
      if (item.href) hrefToId[item.href] = id;
    }

    for (let order = 0; order < spineItems.length; order++) {
      const item: any = spineItems[order];
      const itemId = item.id || '';

      const mt = (item['media-type'] || item.mediaType || '') as string;
      if (mt && !mt.includes('xhtml') && !mt.includes('html')) continue;

      let html: string;
      try {
        html = await epub.getChapterAsync(itemId);
      } catch {
        if (!item.href) continue;
        const mid = hrefToId[item.href];
        if (!mid) continue;
        try { html = await epub.getChapterAsync(mid); } catch { continue; }
      }
      if (!html || html.length < 50) continue;

      const $ = cheerio.load(html);
      $('script, style, nav, header, footer, aside, svg, img, figure, noscript').remove();

      const h1 = $('h1').first().text().trim();
      const h2 = $('h2').first().text().trim();
      const prefersH2 = !!(meta.title && h1 && (
        h1.toLowerCase() === meta.title.toLowerCase() ||
        h1.toLowerCase().startsWith(meta.title.toLowerCase().slice(0, 15))
      ));
      let chapterTitle = (prefersH2 && h2) ? h2 : (h1 || h2 || item.title || '');

      // Detect title page
      const isTitlePage = !!(meta.title && h1 && (
        h1.toLowerCase() === meta.title.toLowerCase() ||
        h1.toLowerCase().startsWith(meta.title.toLowerCase().slice(0, 15))
      ));

      // Collect <p> elements
      const paragraphs: Paragraph[] = [];
      let hasLong = false;

      $('p').each((_: any, el: any) => {
        const t = $(el).text().trim();
        if (t.length < 20) return;
        // Try to extract chapter title from first <p> of the chapter
        if ((!chapterTitle || chapterTitle.length <= 2 || chapterTitle === meta.title) && paragraphs.length === 0) {
          const m = t.match(/^Chapter\s+\w+\s+([A-Z][A-Za-z\s]+?)(?:[,.!?]|\s+(?:When|She|He|It|The|They|Our|After|You|This|All|Next|For|While|Before)|$)/);
          if (m) {
            chapterTitle = m[1].trim();
          }
        }
        if (t.length > 100) hasLong = true;
        if (t.length < 60 && /^(Chapter|Contents|Introduction|[IVX]+\.)/i.test(t)) return;
        paragraphs.push({ text: t, sentences: [] });
      });

      // Fallback: body split by double newlines
      if (!hasLong) {
        const body = $('body').text().replace(/\n+/g, '\n').trim();
        const blocks = body.split(/\n\s*\n/);
        paragraphs.length = 0;
        for (const b of blocks) {
          const t = b.replace(/\s+/g, ' ').trim();
          if (t.length >= 40 && !/^(Chapter|Contents|Introduction)/i.test(t)) {
            if (t.length > 100) hasLong = true;
            paragraphs.push({ text: t, sentences: [] });
          }
        }
      }

      // Skip title pages, TOC, blank pages
      if (isTitlePage && $('p').filter((_: any, e: any) => $(e).text().trim().length >= 40).length < 2) continue;
      if (!hasLong) continue;

      bodyCount++;

      // Build sentences from paragraphs
      let chapterCount = 0;
      for (const p of paragraphs) {
        const sent = splitIntoSentences(p.text);
        p.sentences = sent;
        for (const s of sent) {
          allSentences.push({ text: s, chapterIndex: chapters.length, globalIndex });
          sentenceToChapter.push(chapters.length);
          globalIndex++;
          chapterCount++;
        }
      }

      if (chapterCount === 0) continue;

      chapters.push({
        id: itemId || `ch-${order}`,
        title: chapterTitle.length > 2 && !chapterTitle.startsWith('Chapter ') ? chapterTitle : `Chapter ${bodyCount}`,
        order: bodyCount,
        paragraphs,
        sentenceCount: chapterCount,
        startSentenceIndex: globalIndex - chapterCount,
      });
    }

    return {
      id: this.sourcePath,
      title: meta.title, author: meta.author, language: meta.language,
      format: 'epub', sourcePath: this.sourcePath,
      totalChapters: chapters.length, totalSentences: allSentences.length,
      chapters, sentences: allSentences, sentenceToChapter,
    };
  }
}
