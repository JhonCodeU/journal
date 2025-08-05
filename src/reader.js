const axios = require('axios');
const { JSDOM } = require('jsdom');
const say = require('say');
const inquirer = require('inquirer');
const chalk = require('chalk');

async function readTextOrUrl() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'source',
      message: 'Enter the text or URL to read:',
    },
  ]);

  const source = answers.source.trim();

  if (source.startsWith('http')) {
    try {
      const response = await axios.get(source);
      const dom = new JSDOM(response.data);
      const text = dom.window.document.body.textContent || "";
      say.speak(text);
      console.log(chalk.green('Reading content from URL...'));
    } catch (error) {
      console.error(chalk.red('Error fetching or reading URL:'), error.message);
    }
  } else {
    say.speak(source);
    console.log(chalk.green('Reading text...'));
  }
}

module.exports = { readTextOrUrl };
