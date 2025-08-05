const fs = require('fs');
const chalk = require('chalk');

const VOCAB_FILE = './vocabulary.json';

function getVocabulary() {
  if (!fs.existsSync(VOCAB_FILE)) {
    return [];
  }
  const content = fs.readFileSync(VOCAB_FILE, 'utf8');
  return JSON.parse(content);
}

function saveVocabulary(vocabulary) {
  fs.writeFileSync(VOCAB_FILE, JSON.stringify(vocabulary, null, 2));
}

function saveWord(word) {
  const vocabulary = getVocabulary();
  vocabulary.push(word);
  saveVocabulary(vocabulary);
  console.log(chalk.green(`Saved "${word.word}" to your vocabulary.`));
}

function viewVocabulary() {
  const vocabulary = getVocabulary();
  if (vocabulary.length === 0) {
    console.log(chalk.yellow('Your vocabulary is empty.'));
    return;
  }

  console.log(chalk.cyan.bold('\n--- Your Vocabulary ---'));
  vocabulary.forEach(({ word, translation }) => {
    console.log(`${chalk.yellow(word)}: ${translation}`);
  });
  console.log('\n---------------------');
}

function getWordOfTheDay() {
  const vocabulary = getVocabulary();
  if (vocabulary.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * vocabulary.length);
  return vocabulary[randomIndex];
}

module.exports = { saveWord, viewVocabulary, getWordOfTheDay };
