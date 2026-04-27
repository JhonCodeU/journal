import inquirer from 'inquirer';
import chalk from 'chalk';
import { analyzeText } from './reader.js';
import { addEntry, viewEntries } from './journal.js';
import { viewVocabulary } from './vocabularyManager.js';
import { interactiveMusicSession } from './music.js';
import { reviewSession, getWordsToReview, practiceSentences } from './srs.js';
import { updateStreak, getStatsDisplay, addXP } from './statsManager.js';
import { chatWithTutor, checkAPIKey } from './aiManager.js';

function showStatus(): void {
  const wordsToReview = getWordsToReview();
  const stats = getStatsDisplay();

  console.log(chalk.blue.bold('\n' + '='.repeat(40)));
  console.log(chalk.cyan.bold(`  Lvl ${stats.level} | 🔥 Streak: ${stats.streak} days`));
  console.log(chalk.magenta(`  XP: ${stats.xp} (${stats.progress})`));
  console.log(chalk.blue.bold('='.repeat(40) + '\n'));

  if (wordsToReview.length > 0) {
    console.log(chalk.yellow.bold(`  ⚠️  You have ${wordsToReview.length} words to review today!`));
  } else {
    console.log(chalk.green.bold(`  ✅ All words are reviewed! Excellent.`));
  }
  console.log('');
}

async function startChatSession() {
    if (!checkAPIKey()) return;

    console.log(chalk.magenta.bold('\n--- AI Conversation Practice ---'));
    console.log(chalk.italic('Type "exit" or "quit" to end the session.\n'));

    const chat = await chatWithTutor([]);
    console.log(`${chalk.green('Tutor:')} Hi! I'm your English tutor. What would you like to talk about today?`);

    while (true) {
        const { userInput } = await inquirer.prompt([
            { type: 'input', name: 'userInput', message: chalk.blue('You: ') }
        ]);

        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
            console.log(chalk.green('\nTutor: Great chat! See you next time.\n'));
            break;
        }

        try {
            const result = await chat.sendMessage(userInput);
            const response = await result.response;
            console.log(`\n${chalk.green('Tutor:')} ${response.text()}\n`);
            addXP(5);
        } catch (error) {
            console.log(chalk.red('Error: Could not connect to the AI tutor.'));
            break;
        }
    }
}

async function mainMenu(): Promise<void> {
  updateStreak();
  showStatus();

  const answers = await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '💬 Practice Conversation (AI)', value: 'chat' },
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
    case 'chat':
        await startChatSession();
        break;
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
