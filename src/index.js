
const inquirer = require('inquirer');
const chalk = require('chalk');
const { analyzeText } = require('./reader');
const { addEntry, viewEntries } = require('./journal');

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
    case 'Exit':
      console.log(chalk.green('Goodbye!'));
      return;
  }

  mainMenu();
}

mainMenu();
