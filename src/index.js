const inquirer = require('inquirer');
const chalk = require('chalk');
const { analyzeText } = require('./reader');
const { addEntry, viewEntries } = require('./journal');
const { viewVocabulary } = require('./vocabularyManager');
const { interactiveMusicSession } = require('./music');
const { reviewSession, getWordsToReview } = require('./srs');

function showReviewStatus() {
  const wordsToReview = getWordsToReview();
  if (wordsToReview.length > 0) {
    console.log(chalk.yellow.bold(`\n🔔 You have ${wordsToReview.length} words to review today!`));
  }
}

async function mainMenu() {
  console.log(chalk.blue.bold('\nWelcome to your English Learning Journal!'));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '🧠 Review Vocabulary (SRS)', value: 'review' },
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
      viewEntries();
      break;
    case 'View my vocabulary':
      viewVocabulary();
      break;
    case 'Exit':
      console.log(chalk.green('Goodbye!'));
      return;
  }

  mainMenu();
}

showReviewStatus();
mainMenu();