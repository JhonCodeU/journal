export interface VocabularyItem {
    word: string;
    translation: string;
    /** Days until the next review (SRS interval). */
    strength: number;
    lastReviewed: string | Date;
    example: string | null;
    context?: string;
    /** SM-2 ease factor (defaults to 2.5 when missing). */
    easeFactor?: number;
    /** Consecutive correct reviews (defaults to 0 when missing). */
    repetitions?: number;
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
