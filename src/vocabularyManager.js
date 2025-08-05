const fs = require('fs');
const chalk = require('chalk');

const VOCAB_FILE = './vocabulary.json';

function getVocabulary() {
  if (!fs.existsSync(VOCAB_FILE)) {
    return [];
  }
  const content = fs.readFileSync(VOCAB_FILE, 'utf8');
  let vocabulary = JSON.parse(content);

  // One-time migration for old data structure
  if (vocabulary.length > 0 && !vocabulary[0].hasOwnProperty('strength')) {
    console.log(chalk.yellow('Migrating vocabulary to new format...'));
    vocabulary = vocabulary.map(item => ({
      word: item.word,
      translation: item.translation,
      strength: 1, // Initial strength
      lastReviewed: new Date(0) // Represents a long time ago
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

function viewVocabulary() {
  const vocabulary = getVocabulary();
  if (vocabulary.length === 0) {
    console.log(chalk.yellow('Your vocabulary is empty.'));
    return;
  }

  console.log(chalk.cyan.bold('\n--- Your Vocabulary ---'));
  vocabulary.forEach(({ word, translation, strength }) => {
    console.log(`${chalk.yellow(word)} (${chalk.blue('Strength:' + strength)}): ${translation}`);
  });
  console.log('\n---------------------');
}

module.exports = { getVocabulary, saveVocabulary, saveWord, viewVocabulary };