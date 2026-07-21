import fs from 'fs';

const PROGRESS_FILE = './data/reading_progress.json';

export interface StoredBook {
  totalChapters: number;
  totalSentences: number;
  lastSentenceRead: number;
  lastChapterRead: number;
  path: string;
}

interface ReadingProgressData {
  currentBook: string | null;
  books: Record<string, StoredBook>;
}

const INITIAL: ReadingProgressData = {
  currentBook: null,
  books: {},
};

function load(): ReadingProgressData {
  if (!fs.existsSync(PROGRESS_FILE)) return INITIAL;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return INITIAL;
  }
}

function save(data: ReadingProgressData) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

export function getCurrentBookId(): string | null {
  return load().currentBook;
}

export function getBookProgress(bookId: string): StoredBook | null {
  const data = load();
  return data.books[bookId] || null;
}

export function initBookProgress(bookId: string, totalChapters: number, totalSentences: number, path: string) {
  const data = load();
  data.books[bookId] = {
    totalChapters,
    totalSentences,
    lastSentenceRead: 0,
    lastChapterRead: 0,
    path,
  };
  save(data);
}

export function setCurrentBook(bookId: string) {
  const data = load();
  data.currentBook = bookId;
  save(data);
}

export function saveSentenceProgress(bookId: string, sentenceIndex: number, chapterIndex: number) {
  const data = load();
  if (data.books[bookId]) {
    data.books[bookId].lastSentenceRead = sentenceIndex;
    data.books[bookId].lastChapterRead = chapterIndex;
    save(data);
  }
}

export function getAllBooks(): Record<string, StoredBook> {
  return load().books;
}

export function isBookKnown(bookId: string): boolean {
  return !!load().books[bookId];
}
