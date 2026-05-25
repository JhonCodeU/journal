import axios from 'axios';
import chalk from 'chalk';

const OLLAMA_URL = "http://localhost:11434/api";
const MODEL_NAME = "llama3";

export function checkAPIKey(): boolean {
    return true; 
}

async function callOllama(prompt: string, system: string = "") {
    try {
        const response = await axios.post(`${OLLAMA_URL}/generate`, {
            model: MODEL_NAME,
            prompt: prompt,
            system: system,
            stream: false,
            options: {
                temperature: 0.7
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
    const prompt = `Translate the following song lyrics into Spanish. 
    IMPORTANT: 
    - Translate EVERY single line. Do not skip, omit, or summarize any part of the song.
    - Use natural, idiomatic Spanish. Song lyrics are often informal; the translation should sound like something a person would actually say or sing in Spanish.
    - Avoid overly literal or formal translations. For example, "miss me" should be "me extrañas" (not "nostalgia de mí"), and "business" should be "asuntos" or "cosas" (not "empresa") when used in a personal context.
    - Capture the tone and emotion of the song.
    - Maintain all section headers like [Verse 1], [Chorus], etc., and do not translate them.
    
    Return the result in an interleaved format: 
    - The original English line.
    - The Spanish translation on the next line, prefixed with 'ES: '.
    
    Lyrics:
    ${lyrics}`;
    
    return await callOllama(prompt, "You are a professional translator and music expert with a deep understanding of English idioms, slang, and cultural context. Your goal is to provide a natural, idiomatic Spanish translation that captures the original meaning and tone of the lyrics. Provide ONLY the full interleaved lyrics. Do not add any introductory or concluding text.");
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

export async function getBilingualPage(text: string): Promise<string> {
    const prompt = `Translate the following book page into Spanish. 
    IMPORTANT: 
    - Translate every paragraph. 
    - Use a natural, literary style that matches the tone of the original text.
    - Ensure idiomatic expressions are translated meaningfully rather than literally.
    
    Return the result in an interleaved format: 
    - Original English paragraph.
    - Spanish translation on the next line (prefixed with 'ES: ').
    
    Text:
    ${text}`;
    
    return await callOllama(prompt, "You are a professional literary translator. Your goal is to provide a natural and flowing Spanish translation that captures the author's voice. Provide ONLY the interleaved text.");
}

export async function getPageAnalysis(text: string): Promise<string> {
    const prompt = `Analyze this text from a book: "${text.substring(0, 1000)}..."
    Provide:
    1. A list of 5 key vocabulary words with their meanings in Spanish and a simple example.
    2. Identify 2-3 idiomatic expressions or phrasal verbs found in the text and explain them in Spanish.
    3. A very brief tip on a grammar point found in this specific text.`;
    
    return await callOllama(prompt, "You are an expert English teacher for Spanish speakers.");
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
