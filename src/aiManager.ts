import axios from 'axios';
import chalk from 'chalk';

const OLLAMA_URL = "http://localhost:11434/api";
const MODEL_NAME = "qwen2.5:3b";
const LYRICS_MODEL = "llama3";

export function checkAPIKey(): boolean {
    return true; 
}

async function callOllama(prompt: string, system: string = "", model?: string) {
    try {
        const response = await axios.post(`${OLLAMA_URL}/generate`, {
            model: model || MODEL_NAME,
            prompt: prompt,
            system: system,
            stream: false,
            options: {
                temperature: 0.3
            }
        });
        return response.data.response;
    } catch (error: any) {
        console.log(chalk.red('\n❌ Error: No se pudo conectar con Ollama.'));
        console.log(chalk.yellow('Asegúrate de que Ollama esté abierto y hayas ejecutado: ollama run llama3\n'));
        return "";
    }
}

export async function getAIExample(word: string, translation: string): Promise<string> {
    const prompt = `Generate a simple, natural English example sentence for the word "${word}" (which means "${translation}" in Spanish). Return ONLY the English sentence, nothing else.`;
    return await callOllama(prompt);
}

export async function getStylisticFeedback(text: string): Promise<string> {
    const prompt = `Analyze the following English text: "${text}". Provide brief feedback for a learner (max 3 sentences).`;
    return await callOllama(prompt, "You are a helpful English teacher.");
}

export async function simplifyToA2(text: string): Promise<string> {
    const prompt = `Rewrite this text to a level A2 (Elementary) learner. Use simple vocabulary and short sentences. Maintain the meaning: "${text}"`;
    return await callOllama(prompt, "You are an expert at simplifying English for beginners.");
}

export async function getJournalFeedback(text: string): Promise<string> {
    const prompt = `Provide feedback for this journal entry: "${text}". 
    Structure your response like this:
    1. **Corrected Version**: A natural version.
    2. **Key Corrections**: Explain 2 important improvements.`;
    
    return await callOllama(prompt, "You are a friendly English tutor for A2 students.");
}

export async function getSongContext(title: string, artist: string, lyricsSample: string): Promise<string> {
    const prompt = `Song: "${title}" by ${artist}. 
    Lyrics sample: "${lyricsSample.substring(0, 500)}..."
    Provide:
    1. A 2-sentence summary of what the song is about in Spanish.
    2. List 2-3 interesting slang words or idioms found in the song with their meaning in Spanish.`;
    
    return await callOllama(prompt, "You are a music expert and English teacher.");
}

export async function getBilingualLyrics(lyrics: string): Promise<string> {
    const prompt = `Traduce esta canción al español. 

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
${lyrics}`;

    return await callOllama(prompt, "Traductor de canciones inglés-español. Cada línea original seguida de ES: traducción.", LYRICS_MODEL);
}

export async function getPodcastSummary(title: string, description: string): Promise<string> {
    const prompt = `Podcast Episode: "${title}". 
    Description: "${description}"
    Provide a concise 3-4 sentence summary of this episode in Spanish, focusing on what the listener will learn. Ensure the summary is engaging and natural.`;
    
    return await callOllama(prompt, "You are a helpful educational assistant.");
}

export async function getPodcastVocab(description: string): Promise<{word: string, translation: string}[]> {
    const prompt = `From this podcast description: "${description}", extract 5 interesting or useful English words or idioms for an English learner. 
    For each one, provide its natural Spanish translation based on the context.
    Return ONLY a JSON array of objects with "word" and "translation" keys.
    Example: [{"word": "resilience", "translation": "resiliencia"}]`;
    
    const response = await callOllama(prompt, "You are a language teacher. Return ONLY JSON.");
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
    const prompt = `Analyze this English text for grammar and spelling errors: "${text}".
    Return ONLY a JSON array of objects with these keys:
    "original": the part with the error,
    "corrected": the corrected version,
    "explanation": a short explanation in Spanish of why it's wrong.
    If there are no errors, return [].
    Example: [{"original": "i like share", "corrected": "I like to share", "explanation": "Falta la preposición 'to' después del verbo 'like'."}]`;

    const response = await callOllama(prompt, "You are a precise English grammar expert. Return ONLY JSON.");
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
    const prompt = `How do you say "${spanishPhrase}" in English in a natural way? Provide 1-2 options and a very brief explanation in Spanish.`;
    return await callOllama(prompt, "You are a helpful English-Spanish translation assistant.");
}

export async function getBilingualPage(text: string): Promise<string> {
    const prompt = `Traduce este texto al español, agrupando VARIAS oraciones en cada bloque.

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
${text}`;

    return await callOllama(prompt, "Traductor que agrupa 3-5 oraciones por bloque. ES: traducción, EN: original.");
}

export async function translatePhrase(phrase: string, context?: string): Promise<string> {
    const prompt = context
        ? `Translate this English phrase to Spanish, using the context for accuracy.

Phrase: "${phrase}"
Context: "${context}"

Return ONLY the translation, nothing else.`
        : `Translate this English phrase to Spanish accurately.

Phrase: "${phrase}"

Return ONLY the translation, nothing else.`;

    const response = await callOllama(prompt, "You are an English-to-Spanish translator. Return ONLY the translation.");
    return response?.trim() || phrase;
}

export async function getPageAnalysis(text: string): Promise<string> {
    const prompt = `Analyze this text from a book: "${text.substring(0, 1000)}..."
    Provide:
    1. A list of 5 key vocabulary words with their meanings in Spanish and a simple example.
    2. Identify 2-3 idiomatic expressions or phrasal verbs found in the text and explain them in Spanish.
    3. A very brief tip on a grammar point found in this specific text.`;
    
    return await callOllama(prompt, "You are an expert English teacher for Spanish speakers.");
}

export async function getBatchTranslations(words: string[]): Promise<{word: string, translation: string}[]> {
  if (words.length === 0) return [];
  const prompt = `Translate the following English words to Spanish. Return ONLY a JSON array of objects with "word" and "translation" keys. 
Words: ${JSON.stringify(words)}
Example: [{"word": "heartache", "translation": "angustia"}, {"word": "ripped", "translation": "rasgado"}]`;

  const response = await callOllama(prompt, "You are a translator. Return ONLY valid JSON array.");
  try {
    const jsonStart = response.indexOf('[');
    const jsonEnd = response.lastIndexOf(']') + 1;
    const jsonStr = response.substring(jsonStart, jsonEnd);
    return JSON.parse(jsonStr);
  } catch (e) {
    return words.map(w => ({ word: w, translation: '' }));
  }
}

// Emulación del sistema de chat de Gemini para Ollama
export async function createChatSession() {
    let history: { role: string, content: string }[] = [
        { role: "system", content: "You are a friendly English tutor. Correct my grammar briefly and continue the topic." }
    ];

    return {
        sendMessage: async (message: string) => {
            history.push({ role: "user", content: message });
            
            try {
                const response = await axios.post(`${OLLAMA_URL}/chat`, {
                    model: MODEL_NAME,
                    messages: history,
                    stream: false
                });

                const aiResponse = response.data.message.content;
                history.push({ role: "assistant", content: aiResponse });
                
                return { text: aiResponse };
            } catch (error) {
                return { text: "I'm sorry, I'm having trouble connecting to my brain (Ollama)." };
            }
        }
    };
}
