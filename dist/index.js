import inquirer from 'inquirer';
import chalk from 'chalk';
import { analyzeText } from './reader.js';
import { addEntry, viewEntries } from './journal.js';
import { viewVocabulary } from './vocabularyManager.js';
import { interactiveMusicSession } from './music.js';
import { reviewSession, getWordsToReview, practiceSentences } from './srs.js';
import { updateStreak, getStatsDisplay } from './statsManager.js';
function showStatus() {
    const wordsToReview = getWordsToReview();
    const stats = getStatsDisplay();
    console.log(chalk.blue.bold('\n' + '='.repeat(40)));
    console.log(chalk.cyan.bold(`  Lvl ${stats.level} | 🔥 Streak: ${stats.streak} days`));
    console.log(chalk.magenta(`  XP: ${stats.xp} (${stats.progress})`));
    console.log(chalk.blue.bold('='.repeat(40) + '\n'));
    if (wordsToReview.length > 0) {
        console.log(chalk.yellow.bold(`  ⚠️  You have ${wordsToReview.length} words to review today!`));
    }
    else {
        console.log(chalk.green.bold(`  ✅ All words are reviewed! Excellent.`));
    }
    console.log('');
}
async function mainMenu() {
    updateStreak();
    showStatus();
    const answers = await inquirer.prompt([
        {
            type: 'select',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: '🧠 Review Vocabulary (SRS)', value: 'review' },
                { name: '✍️ Practice Sentences', value: 'practice' },
                { name: '🎵 Learn with Music (Interactive)', value: 'music' },
                new inquirer.Separator(),
                'Analyze a text',
                'Add a new journal entry',
                'View all journal entries',
                'View my vocabulary',
                new inquirer.Separator(),
                'Exit'
            ],
        },
    ]);
    switch (answers.action) {
        case 'review':
            await reviewSession();
            break;
        case 'practice':
            await practiceSentences();
            break;
        case 'music':
            await interactiveMusicSession();
            break;
        case 'Analyze a text':
            await analyzeText();
            break;
        case 'Add a new journal entry':
            await addEntry();
            break;
        case 'View all journal entries':
            await viewEntries();
            break;
        case 'View my vocabulary':
            await viewVocabulary();
            break;
        case 'Exit':
            console.log(chalk.green('Goodbye!'));
            process.exit(0);
    }
    mainMenu();
}
mainMenu();
