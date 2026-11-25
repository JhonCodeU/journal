import { VocabularyItem } from './types.js';

// ── RegExp ───────────────────────────────────────────────────────

/** Escapes characters with special meaning in a regular expression. */
export function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a whole-word regex for `word`, safe for any input.
 * Uses lookarounds instead of \b so words ending in symbols (e.g. "c++") still match.
 */
export function wordRegExp(word: string, flags = 'g'): RegExp {
    return new RegExp(`(?<!\\w)${escapeRegExp(word)}(?!\\w)`, flags);
}

// ── Answer checking ──────────────────────────────────────────────

const LEADING_ARTICLES = /^(el|la|los|las|lo|un|una|unos|unas|to|the|a|an)\s+/;

/** Lowercases, strips accents, punctuation, extra spaces and leading articles. */
export function normalizeAnswer(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[¿?¡!.,;:"'()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(LEADING_ARTICLES, '')
        .trim();
}

/** Splits a stored translation like "casa / hogar, vivienda" into its accepted variants. */
export function acceptedAnswers(expected: string): string[] {
    return expected
        .split(/[\/,;|]/)
        .map(normalizeAnswer)
        .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(
                prev[j] + 1,
                prev[j - 1] + 1,
                diag + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
            diag = tmp;
        }
    }
    return prev[b.length];
}

export type AnswerResult = 'correct' | 'typo' | 'wrong';

/**
 * Compares a user answer against the expected translation.
 * - Ignores case, accents, punctuation and leading articles.
 * - Accepts any variant separated by "/", ",", ";" or "|".
 * - Returns 'typo' for a one-letter slip on words of 5+ letters.
 */
export function checkAnswer(answer: string, expected: string): AnswerResult {
    const given = normalizeAnswer(answer);
    if (!given) return 'wrong';

    const options = acceptedAnswers(expected);
    if (options.includes(given)) return 'correct';

    const closeEnough = options.some(opt => opt.length >= 5 && levenshtein(given, opt) <= 1);
    return closeEnough ? 'typo' : 'wrong';
}

// ── Spaced repetition (SM-2) ─────────────────────────────────────

export const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

/**
 * Updates a word's schedule using a simplified SM-2 algorithm.
 * `strength` stays the interval in days, so existing data keeps working.
 *
 * quality: 5 = correct, 4 = correct with a typo, 1 = wrong.
 */
export function scheduleReview(word: VocabularyItem, quality: number): VocabularyItem {
    let ease = word.easeFactor ?? DEFAULT_EASE;
    let reps = word.repetitions ?? 0;
    let interval = word.strength || 1;

    if (quality < 3) {
        // Forgot it: start again tomorrow, and make it a bit "harder".
        reps = 0;
        interval = 1;
    } else {
        reps += 1;
        if (reps === 1) interval = 1;
        else if (reps === 2) interval = 3;
        else interval = Math.round(interval * ease);
    }

    ease = Math.max(MIN_EASE, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

    return {
        ...word,
        strength: interval,
        easeFactor: Math.round(ease * 100) / 100,
        repetitions: reps,
        lastReviewed: new Date().toISOString(),
    };
}
