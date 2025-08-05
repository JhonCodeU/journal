const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs');
const { commonWords } = require('./vocabulary');
const { saveWord } = require('./vocabularyManager');

const MUSIC_DB_FILE = './music_journal.json';

function getMusicEntries() {
  if (!fs.existsSync(MUSIC_DB_FILE)) {
    return [];
  }
  const content = fs.readFileSync(MUSIC_DB_FILE, 'utf8');
  return JSON.parse(content);
}

function saveMusicEntries(entries) {
  fs.writeFileSync(MUSIC_DB_FILE, JSON.stringify(entries, null, 2));
}

async function addMusicEntry() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'artist',
      message: 'Artist/Band:',
    },
    {
      type: 'input',
      name: 'title',
      message: 'Song Title:',
    },
    {
      type: 'editor',
      name: 'lyrics',
      message: 'Enter the lyrics you are listening to:',
    },
  ]);

  const words = answers.lyrics.split(/\s+/);
  const difficultWords = new Set();

  const highlightedLyrics = words.map(word => {
    const cleanedWord = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanedWord && !commonWords.has(cleanedWord)) {
      difficultWords.add(cleanedWord);
      return chalk.yellow(word);
    } else {
      return word;
    }
  }).join(' ');

  console.log('\n--- Analyzed Lyrics ---');
  console.log(highlightedLyrics);
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

  const entries = getMusicEntries();
  entries.push(answers);
  saveMusicEntries(entries);
  console.log(chalk.green('Song entry saved!'));
}

function viewMusicEntries() {
  const entries = getMusicEntries();
  if (entries.length === 0) {
    console.log(chalk.yellow('No music entries yet.'));
    return;
  }

  entries.forEach((entry, index) => {
    console.log(chalk.cyan.bold(`\n--- Entry ${index + 1} ---
`));
    console.log(chalk.green(`Artist/Band:`), entry.artist);
    console.log(chalk.green(`Song Title:`), entry.title);
    console.log(chalk.green(`Lyrics:`), entry.lyrics);
  });
}

module.exports = { addMusicEntry, viewMusicEntries };
