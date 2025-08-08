const inquirer = require('inquirer');
const chalk = require('chalk');
const { commonWords } = require('./vocabulary');
const { saveWord } = require('./vocabularyManager');

async function analyzeText() {
  const answers = await inquirer.prompt([
    {
      type: 'editor',
      name: 'text',
      message: 'Paste the text you want to analyze:',
    },
  ]);

  const text = answers.text;
  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  const difficultWords = new Set();

  words.forEach(word => {
    const cleanedWord = word.toLowerCase();
    if (!commonWords.has(cleanedWord)) {
      difficultWords.add(word);
    }
  });

  let highlightedText = text;
  difficultWords.forEach(word => {
    const regex = new RegExp(`\b${word}\b`, 'g');
    highlightedText = highlightedText.replace(regex, chalk.yellow(word));
  });

  console.log('\n--- Reading Mode ---');
  console.log(highlightedText);
  console.log('\n--------------------');

  if (difficultWords.size > 0) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Would you like to save any of these difficult words?',
        default: true,
      },
    ]);

    if (confirm) {
      const { wordsToSave } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'wordsToSave',
          message: 'Select words to save:',
          choices: [...difficultWords],
        },
      ]);

      for (const word of wordsToSave) {
        const { translation } = await inquirer.prompt([
          {
            type: 'input',
            name: 'translation',
            message: `Enter the Spanish translation for "${word}":`,
          },
        ]);
        saveWord({ word, translation });
      }
    }
  }
}

module.exports = { analyzeText };
