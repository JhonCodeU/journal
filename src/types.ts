export interface VocabularyItem {
    word: string;
    translation: string;
    strength: number;
    lastReviewed: string | Date;
    example: string | null;
    context?: string;
}

export interface JournalEntry {
    podcastName: string;
    episode: string;
    date: string;
    description: string;
    newWords: string[];
}

export interface UserStats {
    xp: number;
    level: number;
    streak: number;
    lastActivityDate: string | null;
    totalWordsLearned: number;
    totalJournalEntries: number;
}

export interface SentenceData {
    index: number;
    text: string;
    translation?: string;
    explanation?: string;
}

export interface ReadingProgress {
    currentBook: string | null;
    books: {
        [title: string]: {
            totalPages: number;
            lastPageRead: number;
            lastSentenceRead: number;
            totalSentences: number;
            path: string;
        }
    };
}
