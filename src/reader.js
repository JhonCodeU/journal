const inquirer = require('inquirer');
const chalk = require('chalk');
const { commonWords } = require('./vocabulary');

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

  const highlightedText = words.map(word => {
    const cleanedWord = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanedWord && !commonWords.has(cleanedWord)) {
      return chalk.yellow(word);
    } else {
      return word;
    }
  }).join(' ');

  console.log('\n--- Analyzed Text ---');
  console.log(highlightedText);
  console.log('\n---------------------');
}

module.exports = { analyzeText };