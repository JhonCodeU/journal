const inquirer = require('inquirer');
const chalk = require('chalk');
const { analyzeText } = require('./reader');
const { addEntry, viewEntries } = require('./journal');
const { viewVocabulary, getWordOfTheDay } = require('./vocabularyManager');
const { addMusicEntry, viewMusicEntries } = require('./music');

function showWordOfTheDay() {
  const word = getWordOfTheDay();
  if (word) {
    console.log(chalk.cyan.bold('\n--- Word of the Day ---'));
    console.log(`${chalk.yellow(word.word)}: ${word.translation}`);
    console.log('-----------------------\n');
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
        'Analyze a text',
        'Add a new journal entry',
        'View all journal entries',
        'Add a new music entry',
        'View all music entries',
        'View my vocabulary',
        'Exit'
      ],
    },
  ]);

  switch (answers.action) {
    case 'Analyze a text':
      await analyzeText();
      break;
    case 'Add a new journal entry':
      await addEntry();
      break;
    case 'View all journal entries':
      viewEntries();
      break;
    case 'Add a new music entry':
      await addMusicEntry();
      break;
    case 'View all music entries':
      viewMusicEntries();
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

showWordOfTheDay();
mainMenu();