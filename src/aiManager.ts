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
