import dotenv from 'dotenv';
dotenv.config();

import inquirer from 'inquirer';
import chalk from 'chalk';
import { analyzeText } from './reader.js';
import { addEntry, viewEntries } from './journal.js';
import { viewVocabulary } from './vocabularyManager.js';
import { interactiveMusicSession } from './music.js';
import { reviewSession, getWordsToReview, practiceSentences, quickReview } from './srs.js';
import { updateStreak, getStatsDisplay, addXP } from './statsManager.js';
import { createChatSession, checkAPIKey } from './aiManager.js';
import { openBookHub, openWebReader } from './readerManager.js';
import { interactivePodcastSession } from './podcast.js';
import { interactiveAudioLibrarySession, quickLatestBBC } from './audioLibrary.js';
import { interactiveWritingChallenge } from './writingChallenges.js';
import { interactiveFreeWriting } from './freeWriting.js';
import { interactiveGrammarLesson } from './grammarLessons.js';
import { interactiveReadingComprehension } from './readingComprehension.js';
import { newsReader } from './newsReader.js';

const args = process.argv.slice(2);

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

    try {
        const chat = await createChatSession();
        console.log(`${chalk.green('Tutor:')} Hi! I'm your English tutor. What would you like to talk about today?`);

        while (true) {
            const { userInput } = await inquirer.prompt([
                { type: 'input', name: 'userInput', message: chalk.blue('You: ') }
            ]);

            if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
                console.log(chalk.green('\nTutor: Great chat! See you next time.\n'));
                break;
            }

            const result = await chat.sendMessage(userInput);
            console.log(`\n${chalk.green('Tutor:')} ${result.text}\n`);
            addXP(5); 
        }
    } catch (error: any) {
        console.log(chalk.red('\nError: Could not connect to the AI tutor.'));
        console.log(chalk.gray(error.message));
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
      { name: '🎵 Learn with Music (Interactive)', value: 'music' },
        { name: '📖 Books (EPUB/PDF)', value: 'pdf' },
        { name: '🌐 Web Reader (Articles)', value: 'web' },
        { name: '📰 News Reader (RSS)', value: 'news' },
        { name: '📻 Audio Stories & News (Fast)', value: 'audio-lib' },
        { name: '✍️  Free Writing (Your own topic)', value: 'freewriting' },
        { name: '📝 Daily Writing Challenge', value: 'writing' },
        { name: '🎙️ Podcasts (Spotify - Login)', value: 'podcast' },
        { name: '💬 Practice Conversation (AI)', value: 'chat' },
      { name: '📚 Grammar Lessons (Tenses + Exercises)', value: 'grammar' },
      { name: '📖 Reading Comprehension (Text + Questions)', value: 'reading' },
        { name: '🧠 Review Vocabulary (SRS)', value: 'review' },
        { name: '✍️ Practice Sentences', value: 'practice' },
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
    case 'pdf':
        await openBookHub();
        break;
    case 'web':
        await openWebReader();
        break;
    case 'news':
        await newsReader();
        break;
    case 'audio-lib':
        await interactiveAudioLibrarySession();
        break;
    case 'freewriting':
        await interactiveFreeWriting();
        break;
    case 'writing':
        await interactiveWritingChallenge();
        break;
    case 'grammar':
        await interactiveGrammarLesson();
        break;
    case 'reading':
        await interactiveReadingComprehension();
        break;
    case 'podcast':
        await interactivePodcastSession();
        break;
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

  if (!args.includes('--stay')) mainMenu();
}

// ── CLI Flags ────────────────────────────────────────────────────
if (args.includes('--review') || args.includes('-r')) {
  updateStreak();
  showStatus();
  await quickReview();
  console.log(chalk.gray('\nUsa ' + chalk.italic('npm start') + ' para el menú completo.\n'));
} else if (args.includes('--news') || args.includes('-w')) {
    updateStreak();
    await newsReader();
    console.log(chalk.gray('\nUsa ' + chalk.italic('npm start') + ' para el menú completo.\n'));
} else if (args.includes('--bbc') || args.includes('-b')) {
  updateStreak();
  console.log(chalk.cyan.bold('\n🎧 BBC 6 Minute English (Acceso Directo)\n'));
  await quickLatestBBC();
  console.log(chalk.gray('\nUsa ' + chalk.italic('npm start') + ' para el menú completo.\n'));
} else {
  mainMenu();
}
