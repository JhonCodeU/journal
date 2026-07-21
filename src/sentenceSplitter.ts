// Títulos y abreviaciones que no deben partir la oración
const NON_BREAKING = new Set([
    'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'sra', 'st', 'ave',
    'etc', 'eg', 'ie', 'vs', 'dept', 'est', 'govt',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    'us', 'uk', 'un',
]);

export function splitIntoSentences(text: string): string[] {
    // Normalizar espacios
    const normalized = text
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) return [];

    // Dividir usando lookbehind para . ! ? seguido de espacio o fin de string
    // Pero excluir cuando la palabra antes del punto está en NON_BREAKING
    const raw = normalized
        .split(/(?<=[.!?])\s+(?=[A-Z"'(])/);

    const sentences: string[] = [];

    for (let i = 0; i < raw.length; i++) {
        let s = raw[i].trim();
        if (!s) continue;

        // Si la oración es una abreviatura al final, fusionar con la siguiente
        const lastWord = s.match(/\b(\w+)\.?$/)?.[1]?.toLowerCase();
        if (lastWord && NON_BREAKING.has(lastWord) && i + 1 < raw.length) {
            s += ' ' + raw[i + 1];
            i++;
        }

        // Fusionar oraciones muy cortas (< 15 chars) con la siguiente
        while (s.length < 15 && i + 1 < raw.length) {
            s += ' ' + raw[i + 1];
            i++;
        }

        sentences.push(s);
    }

    return sentences.filter(s => s.length > 5);
}
