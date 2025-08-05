const inquirer = require('inquirer');
const chalk = require('chalk');
const { getVocabulary, saveVocabulary } = require('./vocabularyManager');

// Simple SRS logic: words with lower strength or not reviewed recently get prioritized.
function getWordsToReview() {
  const vocabulary = getVocabulary();
  const now = new Date();

  return vocabulary
    .filter(word => {
      const daysSinceReview = (now - new Date(word.lastReviewed)) / (1000 * 60 * 60 * 24);
      // Review if strength is low or it's been a while
      return daysSinceReview >= word.strength;
    })
    .sort((a, b) => a.strength - b.strength); // Prioritize weaker words
}

async function reviewSession() {
  const wordsToReview = getWordsToReview();

  if (wordsToReview.length === 0) {
    console.log(chalk.green.bold('\nExcellent! You have no words to review today. Come back tomorrow!'));
    return;
  }

  console.log(chalk.cyan.bold(`\n--- Review Session: ${wordsToReview.length} words to go! ---\n`));

  for (const word of wordsToReview) {
    const { answer } = await inquirer.prompt([
      {
        type: 'input',
        name: 'answer',
        message: `What is the translation of "${chalk.yellow(word.word)}"?`,
      },
    ]);

    if (answer.toLowerCase().trim() === word.translation.toLowerCase().trim()) {
      console.log(chalk.green('Correct!\n'));
      word.strength += 1;
    } else {
      console.log(chalk.red(`Not quite. The correct answer is: ${chalk.bold(word.translation)}\n`));
      word.strength = Math.max(1, word.strength - 1); // Decrease strength, but not below 1
    }
    word.lastReviewed = new Date();
  }

  const vocabulary = getVocabulary();
  const updatedVocabulary = vocabulary.map(v => {
    const reviewedWord = wordsToReview.find(rw => rw.word === v.word);
    return reviewedWord || v;
  });

  saveVocabulary(updatedVocabulary);

  console.log(chalk.green.bold('\nReview session complete! Keep up the great work!\n'));
}

module.exports = { reviewSession, getWordsToReview };
