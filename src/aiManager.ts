import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';
import chalk from 'chalk';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const MODEL_NAME = "gemini-2.0-flash";

export function checkAPIKey(): boolean {
    if (!process.env.GEMINI_API_KEY) {
        console.log(chalk.red.bold('\n❌ Error: GEMINI_API_KEY not found in .env file.'));
        console.log(chalk.yellow('Please add GEMINI_API_KEY=your_key_here to your .env file.\n'));
        return false;
    }
    return true;
}

export async function getAIExample(word: string, translation: string): Promise<string> {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Generate a simple, natural English example sentence for the word "${word}" (which means "${translation}" in Spanish). Return ONLY the English sentence.`
        });
        return response.text || `I like the word ${word}.`;
    } catch (error) {
        console.error(error);
        return `I like the word ${word}.`;
    }
}

export async function getStylisticFeedback(text: string): Promise<string> {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Analyze the following English text: "${text}". Keep feedback under 3 sentences.`
        });
        return response.text || "Keep practicing!";
    } catch (error) {
        return "Keep practicing!";
    }
}

export async function simplifyToA2(text: string): Promise<string> {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Rewrite the following English text to a level A2 (Elementary) learner. Use simple vocabulary, short sentences, and common grammar. Maintain the original meaning. Text: "${text}"`
        });
        return response.text || text;
    } catch (error) {
        return text;
    }
}

export async function getJournalFeedback(text: string): Promise<string> {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `As an English tutor, provide feedback for this journal entry: "${text}". 
            Structure your response like this:
            1. **Corrected Version**: A natural and grammatically correct version.
            2. **Key Corrections**: Briefly explain 2-3 important grammar or vocabulary improvements.
            Keep it encouraging and clear for an A2 learner.`
        });
        return response.text || "Good job on your entry! Keep writing.";
    } catch (error) {
        return "Keep writing! You are doing great.";
    }
}

export async function createChatSession() {
    return ai.chats.create({
        model: MODEL_NAME,
        config: {
            temperature: 0.7,
            systemInstruction: "You are a friendly English tutor. Correct my grammar briefly and continue the topic.",
        },
        history: [
            {
                role: "user",
                parts: [{ text: "Hello!" }]
            },
            {
                role: "model",
                parts: [{ text: "Hello! I'm your friendly English tutor. What would you like to talk about today?" }]
            }
        ]
    });
}