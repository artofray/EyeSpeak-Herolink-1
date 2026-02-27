// =============================================
// Word Prediction — AAC core vocabulary lookup
// =============================================

import { CORE_VOCABULARY } from '../constants';

/**
 * Given a partial word (e.g. "HEL"), return the top N matching words
 * from the AAC core vocabulary, sorted by length (shorter = more common).
 */
export function predictWords(partial: string, maxResults: number = 3): string[] {
    if (!partial || partial.length < 2) return [];

    const upper = partial.toUpperCase().trim();

    // Don't predict if the partial already has a space (multi-word)
    if (upper.includes(' ')) {
        const lastWord = upper.split(' ').pop() || '';
        if (lastWord.length < 2) return [];
        return predictWords(lastWord, maxResults);
    }

    return CORE_VOCABULARY
        .filter(word => word.startsWith(upper) && word !== upper)
        .sort((a, b) => a.length - b.length)
        .slice(0, maxResults);
}

/**
 * Persist session history to localStorage.
 */
export function saveSessionHistory(entries: { word: string; timestamp: number; type: string }[]): void {
    try {
        const existing = JSON.parse(localStorage.getItem('eyespeak_history') || '[]');
        const combined = [...existing, ...entries].slice(-200); // Keep last 200
        localStorage.setItem('eyespeak_history', JSON.stringify(combined));
    } catch {
        // localStorage not available
    }
}

/**
 * Load session history from localStorage.
 */
export function loadSessionHistory(): { word: string; timestamp: number; type: string }[] {
    try {
        return JSON.parse(localStorage.getItem('eyespeak_history') || '[]');
    } catch {
        return [];
    }
}
