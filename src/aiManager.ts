import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import chalk from 'chalk';

// ── Gemini (cloud, preferred) ─────────────────────────────────────
const GEMINI_MODEL = "gemini-2.0-flash";

let ai: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI | null {
    if (ai) return ai;
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    ai = new GoogleGenAI({ apiKey: key });
    return ai;
}

// ── Ollama (local, fallback) ──────────────────────────────────────
const OLLAMA_URL = "http://localhost:11434/api";
const OLLAMA_MODEL = "qwen2.5:3b";
const OLLAMA_LYRICS_MODEL = "llama3";

let ollamaAvailable: boolean | null = null; // null = not checked yet

async function checkOllama(): Promise<boolean> {
    if (ollamaAvailable !== null) return ollamaAvailable;
    try {
        await axios.get(`${OLLAMA_URL}/tags`, { timeout: 2000 });
        ollamaAvailable = true;
    } catch {
        ollamaAvailable = false;
    }
    return ollamaAvailable;
}

async function callOllama(prompt: string, system: string = "", model?: string): Promise<string> {
    try {
        const response = await axios.post(`${OLLAMA_URL}/generate`, {
            model: model || OLLAMA_MODEL,
            prompt: prompt,
            system: system,
            stream: false,
            options: { temperature: 0.3 }
        });
        return response.data.response;
    } catch {
        return "";
    }
}

// ── Auto-fallback: tries Gemini first, then Ollama ────────────────
function isQuotaError(error: any): boolean {
    const msg = error?.message || error?.toString() || '';
    return msg.includes('429') || msg.includes('QUOTA_EXCEEDED') || msg.includes('quota');
}

async function callAI(prompt: string, system?: string, jsonMode = false): Promise<string> {
    const client = getGemini();

    // Try Gemini first
    if (client) {
        try {
            const params: any = {
                model: GEMINI_MODEL,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            };
            if (system) {
                params.config = { systemInstruction: { role: "user", parts: [{ text: system }] } };
            }
            const result = await client.models.generateContent(params);
            if (result.text) return result.text;
        } catch (error: any) {
            if (isQuotaError(error)) {
                console.log(chalk.yellow('\n⚠️  Gemini quota exceeded, switching to local Ollama...\n'));
            } else {
                console.log(chalk.yellow(`\n⚠️  Gemini error (${error.message}), trying Ollama...\n`));
            }
        }
    }

    // Fallback: Ollama
    const ollamaOk = await checkOllama();
    if (ollamaOk) {
        const result = await callOllama(prompt, system);
        if (result) return result;
    }

    console.log(chalk.red('\n❌ No AI available. Check your GEMINI_API_KEY or start Ollama.'));
    return "";
}

// ── Exported functions ────────────────────────────────────────────

export function checkAPIKey(): boolean {
    // Always return true — we have both Gemini and Ollama as options
    return true;
}

export async function getAIExample(word: string, translation: string): Promise<string> {
    return await callAI(
        `Generate a simple, natural English example sentence for the word "${word}" (which means "${translation}" in Spanish). Return ONLY the English sentence, nothing else.`
    );
}

export async function getStylisticFeedback(text: string): Promise<string> {
    return await callAI(
        `Analyze the following English text: "${text}". Provide brief feedback for a learner (max 3 sentences).`,
        "You are a helpful English teacher."
    );
}

export async function simplifyToA2(text: string): Promise<string> {
    return await callAI(
        `Rewrite this text to a level A2 (Elementary) learner. Use simple vocabulary and short sentences. Maintain the meaning: "${text}"`,
        "You are an expert at simplifying English for beginners."
    );
}

export async function getJournalFeedback(text: string): Promise<string> {
    return await callAI(
        `Provide feedback for this journal entry: "${text}".
    Structure your response like this:
    1. **Corrected Version**: A natural version.
    2. **Key Corrections**: Explain 2 important improvements.`,
        "You are a friendly English tutor for A2 students."
    );
}

export async function getSongContext(title: string, artist: string, lyricsSample: string): Promise<string> {
    return await callAI(
        `Song: "${title}" by ${artist}.
    Lyrics sample: "${lyricsSample.substring(0, 500)}..."
    Provide:
    1. A 2-sentence summary of what the song is about in Spanish.
    2. List 2-3 interesting slang words or idioms found in the song with their meaning in Spanish.`,
        "You are a music expert and English teacher."
    );
}

export async function getBilingualLyrics(lyrics: string): Promise<string> {
    return await callAI(
        `Traduce esta canción al español.

CADA línea en inglés debe ir seguida de su traducción con "ES:".

Formato correcto (ejemplo):
  Lovin' can hurt
  ES: Amar puede doler
  But it's the only thing that I know
  ES: Pero es lo único que conozco

NO hagas esto:
  ES: Amar puede doler  ← falta la línea en inglés arriba
  So tú puedes quedarme ← esto no es inglés ni español

Instrucciones:
- Para cada línea de la canción, escribe la línea original y debajo "ES: traducción"
- Traduce el significado completo, no palabra por palabra
- Los [section headers] déjalos igual
- Si ves "ES:" en la entrada NO la traduzcas otra vez

Canciones:
${lyrics}`,
        "Traductor de canciones inglés-español. Cada línea original seguida de ES: traducción."
    );
}

export async function getPodcastSummary(title: string, description: string): Promise<string> {
    return await callAI(
        `Podcast Episode: "${title}".
    Description: "${description}"
    Provide a concise 3-4 sentence summary of this episode in Spanish, focusing on what the listener will learn. Ensure the summary is engaging and natural.`,
        "You are a helpful educational assistant."
    );
}

export async function getPodcastVocab(description: string): Promise<{word: string, translation: string}[]> {
    const response = await callAI(
        `From this podcast description: "${description}", extract 5 interesting or useful English words or idioms for an English learner.
    For each one, provide its natural Spanish translation based on the context.
    Return ONLY a JSON array of objects with "word" and "translation" keys.
    Example: [{"word": "resilience", "translation": "resiliencia"}]`,
        "You are a language teacher. Return ONLY JSON."
    );
    try {
        const jsonStart = response.indexOf('[');
        const jsonEnd = response.lastIndexOf(']') + 1;
        const jsonStr = response.substring(jsonStart, jsonEnd);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Error parsing AI vocab response:", e);
        return [];
    }
}

export async function getGrammarCorrections(text: string): Promise<{original: string, corrected: string, explanation: string}[]> {
    const response = await callAI(
        `Analyze this English text for grammar and spelling errors: "${text}".
    Return ONLY a JSON array of objects with these keys:
    "original": the part with the error,
    "corrected": the corrected version,
    "explanation": a short explanation in Spanish of why it's wrong.
    If there are no errors, return [].
    Example: [{"original": "i like share", "corrected": "I like to share", "explanation": "Falta la preposición 'to' después del verbo 'like'."}]`,
        "You are a precise English grammar expert. Return ONLY JSON."
    );
    try {
        const jsonStart = response.indexOf('[');
        const jsonEnd = response.lastIndexOf(']') + 1;
        const jsonStr = response.substring(jsonStart, jsonEnd);
        return JSON.parse(jsonStr);
    } catch (e) {
        return [];
    }
}

export async function getWordHelp(spanishPhrase: string): Promise<string> {
    return await callAI(
        `How do you say "${spanishPhrase}" in English in a natural way? Provide 1-2 options and a very brief explanation in Spanish.`,
        "You are a helpful English-Spanish translation assistant."
    );
}

export async function getBilingualPage(text: string): Promise<string> {
    return await callAI(
        `Traduce este texto al español, agrupando VARIAS oraciones en cada bloque.

REGLAS:
- Agrupa MÍNIMO 3-5 oraciones por bloque (como párrafos reales del libro)
- Pon "ES:" primero con la traducción del grupo
- Pon "EN:" después con el original del grupo
- Separa los bloques con una línea vacía

NO hagas esto (una oración por bloque):
ES: Mr. Dursley canturreaba mientras elegía su corbata.
EN: Mr. Dursley hummed as he picked out his tie.
ES: Ninguno notó un búho pasando.
EN: None of them noticed an owl.

Sí haz esto (3-5 oraciones agrupadas):
ES: Mr. Dursley canturreaba mientras elegía su corbata más aburrida para el trabajo. Ninguno de ellos notó un búho que pasaba por la ventana. A las 8:30 Mr. Dursley cogió su maletín y besó a su esposa en la mejilla.
EN: Mr. Dursley hummed as he picked out his most boring tie for work. None of them noticed a large, tawny owl flutter past the window. At half past eight, Mr. Dursley picked up his briefcase and pecked Mrs. Dursley on the cheek.

Texto:
${text}`,
        "Traductor que agrupa 3-5 oraciones por bloque. ES: traducción, EN: original."
    );
}

export async function translatePhrase(phrase: string, context?: string): Promise<string> {
    const prompt = context
        ? `Translate this English phrase to Spanish.\n\nPhrase: "${phrase}"\nContext: "${context}"\n\nReturn ONLY the Spanish translation. Nothing else.`
        : `Translate this English phrase to Spanish.\n\nPhrase: "${phrase}"\n\nReturn ONLY the Spanish translation. Nothing else.`;
    const response = await callAI(prompt, "You translate English to Spanish only. Return ONLY the translation.");
    return response?.trim() || phrase;
}

export async function getPageAnalysis(text: string): Promise<string> {
    return await callAI(
        `Analyze this text from a book: "${text.substring(0, 1000)}..."
    Provide:
    1. A list of 5 key vocabulary words with their meanings in Spanish and a simple example.
    2. Identify 2-3 idiomatic expressions or phrasal verbs found in the text and explain them in Spanish.
    3. A very brief tip on a grammar point found in this specific text.`,
        "You are an expert English teacher for Spanish speakers."
    );
}

export async function getBatchTranslations(words: string[]): Promise<{word: string, translation: string}[]> {
  if (words.length === 0) return [];
  const response = await callAI(
    `Translate these English words to Spanish.\nReturn ONLY a JSON array of objects with "word" and "translation" keys. Translations must be in Spanish.\nWords: ${JSON.stringify(words)}\nExample: [{"word": "heartache", "translation": "angustia"}, {"word": "ripped", "translation": "rasgado"}]`,
    "You translate English to Spanish only. Return ONLY valid JSON array."
  );
  try {
    const jsonStart = response.indexOf('[');
    const jsonEnd = response.lastIndexOf(']') + 1;
    const jsonStr = response.substring(jsonStart, jsonEnd);
    return JSON.parse(jsonStr);
  } catch (e) {
    return words.map(w => ({ word: w, translation: '' }));
  }
}

export async function getKeyVocabulary(text: string): Promise<{ word: string; translation: string }[]> {
    const response = await callAI(
        `Extract 5-7 important English words from this text that an A2 learner should know before reading it.\nFor each word, provide its Spanish translation based on the context.\nReturn ONLY a JSON array of objects with "word" and "translation" keys.\nText: "${text.substring(0, 2000)}"\nExample: [{"word": "crops", "translation": "cultivos"}, {"word": "weeds", "translation": "malas hierbas"}]`,
        "You are a language teacher. Return ONLY valid JSON."
    );
    try {
        const jsonStart = response.indexOf('[');
        const jsonEnd = response.lastIndexOf(']') + 1;
        const jsonStr = response.substring(jsonStart, jsonEnd);
        return JSON.parse(jsonStr);
    } catch (e) {
        return [];
    }
}

export async function evaluateAnswer(question: string, userAnswer: string, text: string): Promise<{ correct: boolean; explanation: string }> {
    const response = await callAI(
        `I am an English learner. I read a text and answered a comprehension question.\n\nText: "${text.substring(0, 1500)}"\n\nQuestion: "${question}"\nMy answer: "${userAnswer}"\n\nBased on the text, is my answer correct? Reply with ONLY a JSON object: {"correct": true/false, "explanation": "a short explanation in English about whether my answer is correct and a suggestion to improve it"}`,
        "You are an English teacher. Return ONLY valid JSON."
    );
    try {
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}') + 1;
        const jsonStr = response.substring(jsonStart, jsonEnd);
        return JSON.parse(jsonStr);
    } catch (e) {
        return { correct: false, explanation: 'Could not evaluate. Try re-reading the text to check your answer.' };
    }
}

// ── Chat (with auto-fallback) ─────────────────────────────────────
export async function createChatSession() {
    const client = getGemini();
    let usingOllama = false;
    let history: { role: string, parts: { text: string }[] }[] = [];

    const SYSTEM_PROMPT = "You are an English tutor for Spanish speakers. The user will write in Spanish asking how to say things in English, or write in English asking for corrections. Help them naturally. Correct their mistakes and explain briefly in Spanish. Be friendly and encouraging.";
    const OLLAMA_SYSTEM = "You are a friendly English tutor. The user is a Spanish speaker learning English. When they ask how to say something, provide the English translation. Correct grammar mistakes and explain briefly in Spanish.";

    async function tryGemini(message: string): Promise<string | null> {
        if (!client) return null;
        try {
            const result = await client.models.generateContent({
                model: GEMINI_MODEL,
                contents: history,
                config: {
                    systemInstruction: {
                        role: "user",
                        parts: [{ text: SYSTEM_PROMPT }]
                    }
                }
            });
            return result.text || null;
        } catch {
            return null;
        }
    }

    async function tryOllamaHistory(): Promise<string | null> {
        const ok = await checkOllama();
        if (!ok) return null;

        const ollamaMessages = history.map(h => ({
            role: h.role === "model" ? "assistant" : h.role,
            content: h.parts.map(p => p.text).join(' ')
        }));

        try {
            const response = await axios.post(`${OLLAMA_URL}/chat`, {
                model: OLLAMA_MODEL,
                messages: [
                    { role: "system", content: OLLAMA_SYSTEM },
                    ...ollamaMessages
                ],
                stream: false
            });
            return response.data.message?.content || null;
        } catch {
            return null;
        }
    }

    return {
        sendMessage: async (message: string) => {
            history.push({ role: "user", parts: [{ text: message }] });

            // Try Gemini first (unless we already fell back to Ollama)
            if (!usingOllama) {
                const result = await tryGemini(message);
                if (result) {
                    history.push({ role: "model", parts: [{ text: result }] });
                    return { text: result };
                }
                console.log(chalk.yellow('\n⚠️  Gemini unavailable, switching to Ollama...\n'));
                usingOllama = true;
            }

            // Fallback: Ollama
            const result = await tryOllamaHistory();
            if (result) {
                history.push({ role: "model", parts: [{ text: result }] });
                return { text: result };
            }

            return { text: "I'm sorry, both Gemini and Ollama are unavailable. Check your GEMINI_API_KEY or start Ollama." };
        }
    };
}
