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
  const words = text.split(/\s+/);
  const difficultWords = new Set();

  const highlightedText = words.map(word => {
    const cleanedWord = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanedWord && !commonWords.has(cleanedWord)) {
      difficultWords.add(cleanedWord);
      return chalk.yellow(word);
    } else {
      return word;
    }
  }).join(' ');

  console.log('\n--- Analyzed Text ---');
  console.log(highlightedText);
  console.log('\n---------------------');

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
