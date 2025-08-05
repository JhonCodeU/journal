const fs = require('fs');
const chalk = require('chalk');
const inquirer = require('inquirer');
const axios = require('axios');

const VOCAB_FILE = './vocabulary.json';
const DICTIONARY_API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';

function getVocabulary() {
  if (!fs.existsSync(VOCAB_FILE)) {
    return [];
  }
  const content = fs.readFileSync(VOCAB_FILE, 'utf8');
  let vocabulary = [];
  try {
    vocabulary = JSON.parse(content);
  } catch (e) {
    console.error(chalk.red('Error parsing vocabulary.json'));
    return [];
  }

  if (vocabulary.length > 0 && !vocabulary[0].hasOwnProperty('strength')) {
    console.log(chalk.yellow('Migrating vocabulary to new format...'));
    vocabulary = vocabulary.map(item => ({
      word: item.word,
      translation: item.translation,
      strength: 1,
      lastReviewed: new Date(0)
    }));
    saveVocabulary(vocabulary);
    console.log(chalk.green('Migration complete!'));
  }

  return vocabulary;
}

function saveVocabulary(vocabulary) {
  fs.writeFileSync(VOCAB_FILE, JSON.stringify(vocabulary, null, 2));
}

function saveWord({ word, translation }) {
  const vocabulary = getVocabulary();
  const newWord = {
    word,
    translation,
    strength: 1,
    lastReviewed: new Date(0),
  };
  vocabulary.push(newWord);
  saveVocabulary(vocabulary);
  console.log(chalk.green(`Saved "${word}" to your vocabulary.`));
}

async function getWordDetails(word) {
  try {
    console.log(chalk.blue(`\nFetching details for "${word}"...`));
    const response = await axios.get(`${DICTIONARY_API_URL}/${word}`);
    const data = response.data[0];

    const phonetic = data.phonetic || (data.phonetics.find(p => p.text) || {}).text;
    const definition = data.meanings[0].definitions[0].definition;
    const example = data.meanings[0].definitions[0].example;

    console.log(chalk.cyan.bold(`\n--- Details for ${word} ---\n`));
    console.log(`${chalk.yellow('Phonetic:')} ${phonetic || 'N/A'}`);
    console.log(`${chalk.yellow('Definition:')} ${definition || 'N/A'}`);
    console.log(`${chalk.yellow('Example:')} ${example || 'N/A'}`);
    console.log('\n------------------------\n');

  } catch (error) {
    console.log(chalk.red('Could not fetch dictionary details for this word.\n'));
  }
}

async function viewVocabulary() {
  const vocabulary = getVocabulary();
  if (vocabulary.length === 0) {
    console.log(chalk.yellow('Your vocabulary is empty.'));
    return;
  }

  const choices = vocabulary.map(item => ({
    name: `${chalk.yellow(item.word)} (${chalk.blue('Strength:' + item.strength)}) - ${item.translation}`,
    value: item.word,
  }));

  choices.push(new inquirer.Separator());
  choices.push({ name: 'Back to main menu', value: 'back' });

  const { selectedWord } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedWord',
      message: 'Select a word to view details:',
      choices: choices,
      loop: false
    },
  ]);

  if (selectedWord === 'back') {
    return;
  }

  await getWordDetails(selectedWord);

  await inquirer.prompt([{ 
      type: 'input',
      name: 'continue',
      message: 'Press Enter to return to your vocabulary list...', 
  }]);

  await viewVocabulary();
}

module.exports = { getVocabulary, saveVocabulary, saveWord, viewVocabulary };
