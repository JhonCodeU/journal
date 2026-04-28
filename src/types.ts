export interface VocabularyItem {
    word: string;
    translation: string;
    strength: number;
    lastReviewed: string | Date;
    example: string | null;
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

export interface ReadingProgress {
    currentBook: string | null;
    books: {
        [title: string]: {
            totalPages: number;
            lastPageRead: number;
            path: string;
        }
    };
}
