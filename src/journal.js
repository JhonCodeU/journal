const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs');
const SpellChecker = require('spellchecker');

const DB_FILE = './storage.json';

function getEntries() {
  if (!fs.existsSync(DB_FILE)) {
    return [];
  }
  const content = fs.readFileSync(DB_FILE, 'utf8');
  return JSON.parse(content);
}

function saveEntries(entries) {
  fs.writeFileSync(DB_FILE, JSON.stringify(entries, null, 2));
}

async function addEntry() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'podcastName',
      message: 'Podcast/Audio Name:',
    },
    {
      type: 'input',
      name: 'episode',
      message: 'Episode/Chapter:',
    },
    {
      type: 'input',
      name: 'description',
      message: 'What did you hear?',
    },
  ]);

  const misspelled = SpellChecker.checkSpelling(answers.description);
  if (misspelled.length > 0) {
    console.log(chalk.yellow('You may have some spelling mistakes:'));
    misspelled.forEach(word => {
      console.log(chalk.red(word.word));
    });
  }

  const entries = getEntries();
  entries.push(answers);
  saveEntries(entries);
  console.log(chalk.green('Entry saved!'));
}

function viewEntries() {
  const entries = getEntries();
  if (entries.length === 0) {
    console.log(chalk.yellow('No entries yet.'));
    return;
  }

  entries.forEach((entry, index) => {
    console.log(chalk.cyan.bold(`
--- Entry ${index + 1} ---
`));
    console.log(chalk.green(`Podcast/Audio:`), entry.podcastName);
    console.log(chalk.green(`Episode/Chapter:`), entry.episode);
    console.log(chalk.green(`Description:`), entry.description);
  });
}

module.exports = { addEntry, viewEntries };
