const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs');
const LanguageTool = require('languagetool-api');
const { saveWord } = require('./vocabularyManager');

const DB_FILE = './storage.json';

// --- Utility Functions for Grammar Check ---
function checkGrammar(text) {
    return new Promise((resolve, reject) => {
        LanguageTool.check({ text, language: 'en-US' }, (error, output) => {
            if (error) reject(error);
            else resolve(output);
        });
    });
}

async function applyCorrections(text) {
    console.log(chalk.blue('\nChecking grammar and style...'));
    try {
        const grammarCheckResult = await checkGrammar(text);
        if (!grammarCheckResult.matches || grammarCheckResult.matches.length === 0) {
            console.log(chalk.green('No grammar or style issues found. Great job!'));
            return text;
        }

        console.log(chalk.yellow('\n--- Grammar and Style Suggestions ---'));
        let currentText = text;
        let offsetAdjustment = 0;

        for (const match of grammarCheckResult.matches) {
            const originalLength = match.length;
            const replacement = match.replacements[0]?.value || '';
            const startIndex = match.offset + offsetAdjustment;
            const endIndex = startIndex + originalLength;

            console.log(`\n${chalk.bold('Error:')} ${match.message}`);
            console.log(`${chalk.bold('Context:')} ...${currentText.substring(Math.max(0, startIndex - 20), startIndex)}${chalk.bgRed.white(currentText.substring(startIndex, endIndex))}${currentText.substring(endIndex, Math.min(currentText.length, endIndex + 20))}...`);
            if (replacement) console.log(`${chalk.bold('Suggestion:')} ${chalk.green(replacement)}`);

            const { apply } = await inquirer.prompt([{ type: 'confirm', name: 'apply', message: 'Apply this correction?', default: false }]);
            if (apply) {
                currentText = currentText.substring(0, startIndex) + replacement + currentText.substring(endIndex);
                offsetAdjustment += (replacement.length - originalLength);
                console.log(chalk.green('Correction applied.'));
            }
        }
        console.log(chalk.yellow('-------------------------------------'));
        return currentText;

    } catch (error) {
        console.error(chalk.red('Error during grammar check:'), error.message);
        return text;
    }
}

// --- Journal Functions ---
function getEntries() {
    if (!fs.existsSync(DB_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error(chalk.red('Error parsing storage.json.'));
        return [];
    }
}

function saveEntries(entries) {
    fs.writeFileSync(DB_FILE, JSON.stringify(entries, null, 2));
}

async function addEntry() {
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

    const newWords = content.newWords.split(',').map(w => w.trim()).filter(Boolean);
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

    console.log(chalk.bold('\n--- Reviewing Your Writing ---'));
    const correctedSummary = await applyCorrections(content.summary);

    const finalEntry = {
        ...podcastInfo,
        date: new Date().toISOString(),
        description: correctedSummary,
        newWords: newWords,
    };

    const entries = getEntries();
    entries.push(finalEntry);
    saveEntries(entries);
    console.log(chalk.green.bold('\n✨ Journal entry saved successfully! ✨'));
}

async function viewEntries() {
    while (true) {
        const entries = getEntries();
        if (entries.length === 0) {
            console.log(chalk.yellow('No entries yet.'));
            return;
        }

        const choices = entries.map((entry, index) => ({
            name: `${new Date(entry.date).toLocaleDateString()} - ${chalk.bold(entry.podcastName)} - ${entry.episode}`, 
            value: index,
        }));

        choices.push(new inquirer.Separator(), { name: 'Back to main menu', value: 'back' });

        const { selectedIndex } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedIndex',
                message: 'Select a journal entry to view, edit, or delete:',
                choices: choices,
                loop: false,
            },
        ]);

        if (selectedIndex === 'back') return;

        const entry = entries[selectedIndex];
        console.log(chalk.cyan.bold(`\n--- Entry Details ---
`));
        console.log(entry.description);
        if (entry.newWords && entry.newWords.length > 0) {
            console.log(chalk.yellow(`\nNew Vocabulary:`), entry.newWords.join(', '));
        }
        console.log(chalk.cyan.bold(`\n---------------------\n`));

        const { action } = await inquirer.prompt([
            {
                type: 'list',
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

module.exports = { addEntry, viewEntries };

