require('dotenv').config();
const inquirer = require('inquirer');
const chalk = require('chalk');
const axios = require('axios');
const cheerio = require('cheerio');
const { saveWord } = require('./vocabularyManager');

const GENIUS_API_BASE_URL = 'https://api.genius.com';
const GENIUS_ACCESS_TOKEN = process.env.GENIUS_API_TOKEN;

async function searchGenius(query) {
  try {
    const response = await axios.get(`${GENIUS_API_BASE_URL}/search`, {
      headers: {
        'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}`,
      },
      params: { q: query },
    });
    return response.data.response.hits;
  } catch (error) {
    console.error(chalk.red('Error searching Genius API:'), error.message);
    return [];
  }
}

async function getLyricsFromGeniusPage(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Genius lyrics are typically in a div with data-lyrics-container attribute
    // or within a div with a specific class like 'lyrics'
    let lyrics = '';
    $('[data-lyrics-container="true"], .lyrics').each((i, elem) => {
      lyrics += $(elem).text().trim() + '\n\n';
    });

    if (!lyrics) {
      // Fallback for older structures or different layouts
      lyrics = $('div.lyrics').text().trim();
    }

    // Clean up common annotations/extra text
    lyrics = lyrics.replace(/\n\[.*?\]\n/g, '\n'); // Remove [Verse], [Chorus] etc.
    lyrics = lyrics.replace(/\n\n\n/g, '\n\n'); // Reduce multiple newlines
    lyrics = lyrics.trim();

    return lyrics;
  } catch (error) {
    console.error(chalk.red('Error scraping lyrics from Genius page:'), error.message);
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

  const { query } = await inquirer.prompt([
    { type: 'input', name: 'query', message: 'Enter artist and song title (e.g., "Queen Bohemian Rhapsody"):' },
  ]);

  console.log(chalk.blue(`\nSearching Genius for "${query}"...`));
  const hits = await searchGenius(query);

  if (hits.length === 0) {
    console.log(chalk.red('Sorry, no songs found on Genius for your query.\n'));
    return;
  }

  const choices = hits.map((hit, index) => ({
    name: `${index + 1}. ${hit.result.artist_names} - ${hit.result.title}`,
    value: hit.result.url,
  }));

  choices.push(new inquirer.Separator());
  choices.push({ name: 'Back to main menu', value: 'back' });

  const { selectedSongUrl } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedSongUrl',
      message: 'Select the correct song:',
      choices: choices,
      loop: false,
    },
  ]);

  if (selectedSongUrl === 'back') {
    return;
  }

  console.log(chalk.blue('Fetching lyrics from Genius page...'));
  const lyrics = await getLyricsFromGeniusPage(selectedSongUrl);

  if (!lyrics) {
    console.log(chalk.red('Could not retrieve lyrics for the selected song.\n'));
    return;
  }

  console.log(chalk.green('Lyrics found! Get ready to play.\n'));
  const youtubeLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
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
      console.log(`${i + 1}. ${chalk.green(answered)} - Correct!`)
      score++;
    } else {
      console.log(`${i + 1}. ${chalk.red(answered)} - Incorrect. Correct word was: ${chalk.yellow(original)}`);
      wordsToSave.add(original.toLowerCase());
    }
  }
  console.log(chalk.bold(`\nYou scored ${score} out of ${originalWords.length}!\n`));

  if (wordsToSave.size > 0) {
    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Do you want to save the words you missed to your vocabulary?',
            default: true
        }
    ]);

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
