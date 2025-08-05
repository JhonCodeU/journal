
const inquirer = require('inquirer');
const chalk = require('chalk');
const { readTextOrUrl } = require('./reader');
const { addEntry, viewEntries } = require('./journal');

async function mainMenu() {
  console.log(chalk.blue.bold('\nWelcome to your English Learning Journal!'));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        'Read text or URL aloud',
        'Add a new journal entry',
        'View all journal entries',
        'Exit'
      ],
    },
  ]);

  switch (answers.action) {
    case 'Read text or URL aloud':
      await readTextOrUrl();
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
