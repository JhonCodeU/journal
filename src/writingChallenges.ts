import inquirer from 'inquirer';
import chalk from 'chalk';
import { applyCorrections, saveEntries, getEntries } from './journal.js';
import { getJournalFeedback, getWordHelp } from './aiManager.js';
import { addXP } from './statsManager.js';
import { JournalEntry } from './types.js';

const WRITING_PROMPTS = [
    "What is your favorite childhood memory and why?",
    "If you could travel anywhere in the world, where would you go?",
    "Describe your perfect day from start to finish.",
    "What are three things you are grateful for today?",
    "If you could have dinner with any historical figure, who would it be?",
    "What is a goal you want to achieve in the next five years?",
    "Describe a book or movie that changed the way you think.",
    "If you won the lottery tomorrow, what would be the first thing you buy?",
    "What is the most important quality in a friend?",
    "How do you usually handle stress or difficult situations?",
    "If you could have any superpower, which one would you choose?",
    "What is your favorite season of the year and what do you like about it?",
    "Talk about a person who has had a significant impact on your life.",
    "What does 'success' mean to you?",
    "If you could change one thing about the world, what would it be?"
];

export async function interactiveWritingChallenge(): Promise<void> {
    console.log(chalk.magenta.bold('\n📝 Daily Writing Challenge\n'));
    console.log(chalk.gray('Improve your English by writing about a specific topic.\n'));

    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const promptIndex = dayOfYear % WRITING_PROMPTS.length;
    const dailyPrompt = WRITING_PROMPTS[promptIndex];

    console.log(chalk.cyan.bold('Today\'s Topic:'));
    console.log(chalk.white.italic(`"${dailyPrompt}"\n`));

    const { start } = await inquirer.prompt([{
        type: 'confirm',
        name: 'start',
        message: 'Would you like to start this challenge?',
        default: true
    }]);

    if (!start) return;

    let userResponse = "";
    let isDone = false;

    while (!isDone) {
        console.clear();
        console.log(chalk.magenta.bold('\n📝 Daily Writing Challenge'));
        console.log(chalk.cyan.bold('Topic: ') + chalk.white.italic(dailyPrompt));
        console.log(chalk.cyan.bold('\n--- Your Current Response ---'));
        console.log(userResponse ? chalk.white(userResponse) : chalk.gray('(Empty - choose "Edit" to start writing)'));
        console.log(chalk.cyan.bold('-----------------------------\n'));

        const { action } = await inquirer.prompt([{
            type: 'select',
            name: 'action',
            message: 'Actions:',
            choices: [
                { name: '✍️  Write / Edit Response', value: 'edit' },
                { name: '🤔  Ask AI for help (Translation)', value: 'help' },
                { name: '✅  Finish & Check Grammar', value: 'finish' },
                { name: '❌  Exit Challenge', value: 'cancel' }
            ]
        }]);

        if (action === 'edit') {
            const { content } = await inquirer.prompt([{
                type: 'editor',
                name: 'content',
                message: 'Write your response in English:',
                default: userResponse
            }]);
            userResponse = content.trim();
        } else if (action === 'help') {
            const { phrase } = await inquirer.prompt([{
                type: 'input',
                name: 'phrase',
                message: 'What do you want to say? (In Spanish):'
            }]);
            
            if (phrase.trim()) {
                console.log(chalk.blue('\nAsking the AI assistant...'));
                const help = await getWordHelp(phrase);
                console.log(chalk.green.bold('\n--- AI SUGGESTION ---'));
                console.log(help);
                console.log(chalk.green.bold('---------------------\n'));
                await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Press Enter to return to menu...' }]);
            }
        } else if (action === 'finish') {
            if (userResponse.length < 15) {
                console.log(chalk.yellow('\nYour response is too short. Try to write at least 2-3 sentences!'));
                await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Press Enter to continue...' }]);
            } else {
                isDone = true;
            }
        } else if (action === 'cancel') {
            return;
        }
    }

    console.log(chalk.bold('\n--- Step 1: AI Grammar & Style Check ---'));
    const correctedContent = await applyCorrections(userResponse);

    console.log(chalk.blue('\n--- Step 2: AI Tutor Analysis ---'));
    const feedback = await getJournalFeedback(correctedContent);
    
    console.log(chalk.magenta.bold('\n' + '='.repeat(40)));
    console.log(chalk.magenta.bold('       🌟 WRITING FEEDBACK 🌟'));
    console.log(chalk.magenta.bold('='.repeat(40)));
    console.log(feedback);
    console.log(chalk.magenta.bold('='.repeat(40) + '\n'));

    const { saveToJournal } = await inquirer.prompt([{
        type: 'confirm',
        name: 'saveToJournal',
        message: 'Would you like to save this challenge in your journal?',
        default: true
    }]);

    if (saveToJournal) {
        const entries = getEntries();
        const newEntry: JournalEntry = {
            podcastName: 'Writing Challenge',
            episode: dailyPrompt.substring(0, 30) + '...',
            date: new Date().toISOString(),
            description: correctedContent,
            newWords: []
        };
        entries.push(newEntry);
        saveEntries(entries);
        console.log(chalk.green('\n✔ Saved to your journal!\n'));
    }

    console.log(chalk.yellow.bold('Extra Reward: +100 XP for completing the daily challenge! 🏆'));
    addXP(100);
}
