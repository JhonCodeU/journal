import inquirer from 'inquirer';
import chalk from 'chalk';
import { applyCorrections, saveEntries, getEntries } from './journal.js';
import { getJournalFeedback, getWordHelp } from './aiManager.js';
import { addXP } from './statsManager.js';
import { JournalEntry } from './types.js';

export async function interactiveFreeWriting(): Promise<void> {
    console.log(chalk.magenta.bold('\n✍️  Free Writing\n'));
    console.log(chalk.gray('Write about ANY topic you want. I will help you with vocabulary and grammar.\n'));

    // Step 1: Choose a topic
    const { topicChoice } = await inquirer.prompt([
        {
            type: 'select',
            name: 'topicChoice',
            message: 'Choose your topic:',
            choices: [
                { name: '✍️  I already have a topic in mind', value: 'custom' },
                { name: '🎲  Surprise me with a random topic', value: 'random' },
                { name: '❌  Cancel', value: 'cancel' }
            ]
        }
    ]);

    if (topicChoice === 'cancel') return;

    let topic = '';
    if (topicChoice === 'random') {
        const topics = [
            "A city I would like to visit",
            "My favorite food",
            "A hobby I enjoy",
            "My daily routine",
            "A memorable trip",
            "My favorite season",
            "A movie or series I recommend",
            "What I do on weekends",
            "My family",
            "A sport I like",
            "The weather in my city",
            "My dream job",
            "A celebration in my country",
            "My favorite animal",
            "Something I learned recently"
        ];
        topic = topics[Math.floor(Math.random() * topics.length)];
        console.log(chalk.cyan.bold(`\nYour topic: ${chalk.white.italic(topic)}\n`));
    } else {
        const { customTopic } = await inquirer.prompt([
            {
                type: 'input',
                name: 'customTopic',
                message: 'What do you want to write about? (In Spanish or English):'
            }
        ]);
        topic = customTopic.trim();
    }

    // Step 2: Write
    let userText = "";
    let isDone = false;

    while (!isDone) {
        console.clear();
        console.log(chalk.magenta.bold('\n✍️  Free Writing'));
        console.log(chalk.cyan.bold('Topic: ') + chalk.white.italic(topic));
        console.log(chalk.cyan.bold('\n--- Your Writing ---'));
        console.log(userText ? chalk.white(userText) : chalk.gray('(Empty - choose "Write" to start)'));
        console.log(chalk.cyan.bold('--------------------\n'));

        const { action } = await inquirer.prompt([
            {
                type: 'select',
                name: 'action',
                message: 'What do you want to do?',
                choices: [
                    { name: '✍️  Write / Edit', value: 'edit' },
                    { name: '🔤  I do not know how to say something (Spanish → English)', value: 'help' },
                    { name: '✅  Finish & Check Grammar', value: 'finish' },
                    { name: '❌  Exit', value: 'cancel' }
                ]
            }
        ]);

        if (action === 'edit') {
            const { content } = await inquirer.prompt([{
                type: 'editor',
                name: 'content',
                message: 'Write in English:',
                default: userText
            }]);
            userText = content.trim();
        } else if (action === 'help') {
            const { phrase } = await inquirer.prompt([{
                type: 'input',
                name: 'phrase',
                message: 'What do you want to say? (Write it in Spanish):'
            }]);
            
            if (phrase.trim()) {
                console.log(chalk.blue('\nAsking Gemini...'));
                const help = await getWordHelp(phrase);
                console.log(chalk.green.bold('\n--- AI SUGGESTION ---'));
                console.log(help);
                console.log(chalk.green.bold('---------------------\n'));
                await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Press Enter to continue...' }]);
            }
        } else if (action === 'finish') {
            if (userText.length < 10) {
                console.log(chalk.yellow('\nYour text is too short. Try to write at least 2-3 sentences!'));
                await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Press Enter to continue...' }]);
            } else {
                isDone = true;
            }
        } else if (action === 'cancel') {
            return;
        }
    }

    // Step 3: Grammar check
    console.log(chalk.bold('\n--- Checking Grammar & Style ---'));
    const correctedText = await applyCorrections(userText);

    // Step 4: AI Feedback
    console.log(chalk.blue('\n--- Getting AI Tutor Feedback ---'));
    const feedback = await getJournalFeedback(correctedText);
    
    console.log(chalk.magenta.bold('\n' + '='.repeat(40)));
    console.log(chalk.magenta.bold('       🌟 FEEDBACK 🌟'));
    console.log(chalk.magenta.bold('='.repeat(40)));
    console.log(feedback);
    console.log(chalk.magenta.bold('='.repeat(40) + '\n'));

    // Step 5: Save
    const { save } = await inquirer.prompt([{
        type: 'confirm',
        name: 'save',
        message: 'Save this to your journal?',
        default: true
    }]);

    if (save) {
        const entries = getEntries();
        const newEntry: JournalEntry = {
            podcastName: 'Free Writing',
            episode: topic.substring(0, 40),
            date: new Date().toISOString(),
            description: correctedText,
            newWords: []
        };
        entries.push(newEntry);
        saveEntries(entries);
        console.log(chalk.green('\n✔ Saved to your journal!\n'));
    }

    console.log(chalk.yellow.bold('+50 XP for writing practice! 🏆'));
    addXP(50);
}
