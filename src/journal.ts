import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import { saveWord } from './vocabularyManager.js';
import { JournalEntry } from './types.js';
import { getJournalFeedback, getGrammarCorrections } from './aiManager.js';
import { addXP } from './statsManager.js';

const DB_FILE = './storage.json';

export async function applyCorrections(text: string): Promise<string> {
    console.log(chalk.blue('\nChecking grammar and style with AI...'));
    try {
        const corrections = await getGrammarCorrections(text);
        if (corrections.length === 0) {
            console.log(chalk.green('No grammar or style issues found. Great job!'));
            return text;
        }

        console.log(chalk.yellow('\n--- Grammar and Style Suggestions ---'));
        let currentText = text;

        for (const corr of corrections) {
            console.log(`\n${chalk.bold('Original:')} ${chalk.red(corr.original)}`);
            console.log(`${chalk.bold('Correction:')} ${chalk.green(corr.corrected)}`);
            console.log(`${chalk.bold('Explanation:')} ${chalk.white(corr.explanation)}`);

            const { apply } = await inquirer.prompt([{ 
                type: 'confirm', 
                name: 'apply', 
                message: `Apply this correction?`, 
                default: true 
            }]);

            if (apply) {
                // Simple string replacement for CLI
                currentText = currentText.replace(corr.original, corr.corrected);
                console.log(chalk.green('Correction applied.'));
            }
        }
        console.log(chalk.yellow('\n-------------------------------------'));
        return currentText;

    } catch (error: any) {
        console.error(chalk.red('Error during AI grammar check:'), error.message);
        return text;
    }
}

// --- Journal Functions ---
export function getEntries(): JournalEntry[] {
    if (!fs.existsSync(DB_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error(chalk.red('Error parsing storage.json.'));
        return [];
    }
}

export function saveEntries(entries: JournalEntry[]): void {
    fs.writeFileSync(DB_FILE, JSON.stringify(entries, null, 2));
}

export async function saveEntry(content: string): Promise<void> {
    const entries = getEntries();
    const newEntry: JournalEntry = {
        podcastName: 'Podcast Study',
        episode: 'Manual Entry',
        date: new Date().toISOString(),
        description: content,
        newWords: []
    };
    entries.push(newEntry);
    saveEntries(entries);
    addXP(10);
}

export async function addEntry(): Promise<void> {
    const podcastInfo = await inquirer.prompt([
        { type: 'input', name: 'podcastName', message: 'Podcast/Audio Name:' },
        { type: 'input', name: 'episode', message: 'Episode/Chapter:' },
    ]);

    const content = await inquirer.prompt([
        {
            type: 'editor',
            name: 'summary',
            message: 'Write a summary of what you understood. You can mention the main idea, key points, and any personal thoughts.',
        },
        {
            type: 'input',
            name: 'newWords',
            message: 'What new words or phrases did you hear? (Separate with commas)',
        },
    ]);

    const newWords: string[] = content.newWords.split(',').map((w: string) => w.trim()).filter(Boolean);
    if (newWords.length > 0) {
        console.log(chalk.cyan('\n--- Adding New Words to Vocabulary ---'));
        for (const word of newWords) {
            const { translation } = await inquirer.prompt([{ 
                type: 'input',
                name: 'translation',
                message: `Enter the Spanish translation for "${chalk.yellow(word)}":`
            }]);
            if (translation) await saveWord({ word, translation });
        }
        console.log(chalk.green('Vocabulary updated!\n'));
    }

    console.log(chalk.bold('\n--- Analyzing Your Writing ---'));
    const correctedSummary = await applyCorrections(content.summary);

    console.log(chalk.blue('\nGetting Detailed AI Tutor Feedback...'));
    const aiFeedback = await getJournalFeedback(correctedSummary);
    console.log(chalk.magenta.bold('\n' + '='.repeat(40)));
    console.log(chalk.magenta.bold('       🌟 AI TUTOR FEEDBACK 🌟'));
    console.log(chalk.magenta.bold('='.repeat(40)));
    console.log(aiFeedback);
    console.log(chalk.magenta.bold('='.repeat(40) + '\n'));

    const finalEntry: JournalEntry = {
        podcastName: podcastInfo.podcastName,
        episode: podcastInfo.episode,
        date: new Date().toISOString(),
        description: correctedSummary,
        newWords: newWords,
    };

    const entries = getEntries();
    entries.push(finalEntry);
    saveEntries(entries);
    addXP(50); 
    console.log(chalk.green.bold('\n✨ Journal entry saved successfully! ✨'));
}

export async function viewEntries(): Promise<void> {
    while (true) {
        const entries = getEntries();
        if (entries.length === 0) {
            console.log(chalk.yellow('No entries yet.'));
            return;
        }

        const choices: any[] = entries.map((entry, index) => ({
            name: `${new Date(entry.date).toLocaleDateString()} - ${chalk.bold(entry.podcastName)} - ${entry.episode}`, 
            value: index,
        }));

        choices.push(new inquirer.Separator(), { name: 'Back to main menu', value: 'back' });

        const { selectedIndex } = await inquirer.prompt([
            {
                type: 'select',
                name: 'selectedIndex',
                message: 'Select a journal entry to view, edit, or delete:',
                choices: choices,
                loop: false,
            },
        ]);

        if (selectedIndex === 'back') return;

        const entry = entries[selectedIndex];
        console.log(chalk.cyan.bold(`\n--- Entry Details ---\n`));
        console.log(entry.description);
        if (entry.newWords && entry.newWords.length > 0) {
            console.log(chalk.yellow(`\nNew Vocabulary:`), entry.newWords.join(', '));
        }
        console.log(chalk.cyan.bold(`\n---------------------\n`));

        const { action } = await inquirer.prompt([
            {
                type: 'select',
                name: 'action',
                message: 'What do you want to do?',
                choices: ['Edit Summary', 'Delete Entry', new inquirer.Separator(), 'Go Back'],
            },
        ]);

        if (action === 'Edit Summary') {
            const { editedSummary } = await inquirer.prompt([
                {
                    type: 'editor',
                    name: 'editedSummary',
                    message: 'Edit your summary:',
                    default: entry.description,
                },
            ]);
            console.log(chalk.bold('\n--- Reviewing Your Edits ---'));
            entry.description = await applyCorrections(editedSummary);
            saveEntries(entries);
            console.log(chalk.green('Entry updated successfully!'));
        } else if (action === 'Delete Entry') {
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: `Are you sure you want to delete the entry for "${entry.podcastName}"?`,
                    default: false,
                },
            ]);
            if (confirm) {
                entries.splice(selectedIndex, 1);
                saveEntries(entries);
                console.log(chalk.red('Entry deleted.'));
            }
        }
    }
}