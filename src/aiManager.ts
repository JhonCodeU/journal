import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';
import chalk from 'chalk';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export function checkAPIKey(): boolean {
    if (!process.env.GEMINI_API_KEY) {
        console.log(chalk.red.bold('\n❌ Error: GEMINI_API_KEY not found in .env file.'));
        console.log(chalk.yellow('Please add GEMINI_API_KEY=your_key_here to your .env file.\n'));
        return false;
    }
    return true;
}

export async function getAIExample(word: string, translation: string): Promise<string> {
    const prompt = `Generate a simple, natural English example sentence for the word "${word}" (which means "${translation}" in Spanish). 
    The sentence should be easy to understand for an English learner. 
    Return ONLY the English sentence, nothing else.`;

    try {
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        return `I like the word ${word}.`; // Fallback
    }
}

export async function getStylisticFeedback(text: string): Promise<string> {
    const prompt = `Analyze the following English text written by a student: "${text}".
    Provide a brief, friendly suggestion on how to make it sound more natural or native-like. 
    If it's already perfect, just say "Great job! This sounds very natural."
    Keep the feedback under 3 sentences.`;

    try {
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        return "Keep practicing!";
    }
}

export async function chatWithTutor(history: { role: "user" | "model", parts: { text: string }[] }[]) {
    const chat = model.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: "You are a friendly English tutor. Your goal is to help me practice conversation. Correct my grammar briefly if I make a mistake, then answer my question or continue the topic." }],
            },
            {
                role: "model",
                parts: [{ text: "Hi! I'm your English tutor. I'd love to chat with you. What would you like to talk about today?" }],
            },
            ...history
        ],
    });

    return chat;
}
