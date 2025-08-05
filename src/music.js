const inquirer = require('inquirer');
const chalk = require('chalk');
const axios = require('axios');
const { saveWord } = require('./vocabularyManager');

const API_URL = 'https://api.lyrics.ovh/v1';

async function fetchLyrics(artist, title) {
  try {
    const response = await axios.get(`${API_URL}/${artist}/${title}`);
    return response.data.lyrics;
  } catch (error) {
    return null;
  }
}

function createFillInTheBlanks(lyrics, difficulty = 0.15) {
  const words = lyrics.split(/(\s+)/); // Keep whitespace
  let blankedCount = 0;
  const totalWords = words.filter(w => w.trim() !== '').length;
  const targetBlanked = Math.floor(totalWords * difficulty);
  const originalWords = [];

  const blankedLyrics = words.map(word => {
    if (word.trim() !== '' && Math.random() < difficulty && blankedCount < targetBlanked) {
      originalWords.push(word);
      blankedCount++;
      return `[${chalk.yellow('_'.repeat(word.length))}]`;
    } 
    return word;
  }).join('');

  return { blankedLyrics, originalWords };
}

async function interactiveMusicSession() {
  console.log(chalk.cyan.bold('\n🎵 Welcome to the Interactive Music Session!\n'));

  const { artist, title } = await inquirer.prompt([
    { type: 'input', name: 'artist', message: 'Enter the artist:' },
    { type: 'input', name: 'title', message: 'Enter the song title:' },
  ]);

  console.log(chalk.blue(`\nSearching for lyrics for "${title}" by ${artist}...`));
  const lyrics = await fetchLyrics(artist, title);

  if (!lyrics) {
    console.log(chalk.red('Sorry, lyrics not found. Please check the spelling or try another song.\n'));
    return;
  }

  console.log(chalk.green('Lyrics found! Get ready to play.\n'));
  const youtubeLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`;
  console.log(`🎧 Listen to the song here: ${chalk.underline.blue(youtubeLink)}\n`);

  const { blankedLyrics, originalWords } = createFillInTheBlanks(lyrics);
  console.log(chalk.bold('--- Fill in the blanks while you listen ---'));
  console.log(blankedLyrics);
  console.log(chalk.bold('------------------------------------------\n'));

  const userAnswers = [];
  for (let i = 0; i < originalWords.length; i++) {
    const { answer } = await inquirer.prompt([{
      type: 'input',
      name: 'answer',
      message: `Blank #${i + 1}:`,
    }]);
    userAnswers.push(answer.trim());
  }

  let score = 0;
  const wordsToSave = new Set();
  console.log(chalk.cyan.bold('\n--- Results ---'));
  for (let i = 0; i < originalWords.length; i++) {
    const original = originalWords[i].replace(/[^a-zA-Z0-9]/g, ''); // Clean punctuation
    const answered = userAnswers[i];
    if (original.toLowerCase() === answered.toLowerCase()) {
      console.log(`${i + 1}. ${chalk.green(answered)} - Correct!`);
      score++;
    } else {
      console.log(`${i + 1}. ${chalk.red(answered)} - Incorrect. Correct word was: ${chalk.yellow(original)}`);
      wordsToSave.add(original.toLowerCase());
    }
  }
  console.log(chalk.bold(`\nYou scored ${score} out of ${originalWords.length}!\n`));

  if (wordsToSave.size > 0) {
    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to save the words you missed to your vocabulary?',
        default: true
    }]);

    if (confirm) {
        for (const word of wordsToSave) {
            const { translation } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'translation',
                    message: `Enter the Spanish translation for "${word}":`
                }
            ]);
            if (translation) {
                saveWord({ word, translation });
            }
        }
    }
  }
}

module.exports = { interactiveMusicSession };
