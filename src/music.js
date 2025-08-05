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

    let lyrics = '';
    $('[data-lyrics-container="true"], .lyrics').each((i, elem) => {
      lyrics += $(elem).text().trim() + '\n\n';
    });

    if (!lyrics) {
      lyrics = $('div.lyrics').text().trim();
    }

    lyrics = lyrics.replace(/\n\[.*?\]\n/g, '\n');
    lyrics = lyrics.replace(/\n\n\n/g, '\n\n');
    lyrics = lyrics.trim();

    return lyrics;
  } catch (error) {
    console.error(chalk.red('Error scraping lyrics from Genius page:'), error.message);
    return null;
  }
}

function createFillInTheBlanks(lyrics, difficulty = 0.15) {
  const lines = lyrics.split('\n').filter(line => line.trim() !== '');
  const processedLines = [];
  const allOriginalWords = [];

  lines.forEach(line => {
    const wordsInLine = line.split(/(\s+)/); 
    let blankedLineDisplay = '';
    const originalWordsInThisLine = [];
    let blankedCountInLine = 0;
    const totalFillableWordsInLine = wordsInLine.filter(w => w.trim() !== '' && w.match(/[a-zA-Z]/)).length;
    const targetBlankedInLine = Math.floor(totalFillableWordsInLine * difficulty);

    wordsInLine.forEach(part => {
      const cleanedPart = part.trim();
      if (cleanedPart !== '' && cleanedPart.match(/[a-zA-Z]/) && Math.random() < difficulty && blankedCountInLine < targetBlankedInLine) {
        originalWordsInThisLine.push(cleanedPart);
        allOriginalWords.push(cleanedPart);
        blankedCountInLine++;
        blankedLineDisplay += `[${chalk.yellow('_'.repeat(cleanedPart.length))}]`;
      } else {
        blankedLineDisplay += part;
      }
    });
    processedLines.push({
      originalLine: line,
      blankedLineDisplay: blankedLineDisplay,
      originalWordsInThisLine: originalWordsInThisLine
    });
  });
  return { processedLines, allOriginalWords };
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

  const { processedLines, allOriginalWords } = createFillInTheBlanks(lyrics);
  const missedWordsOverall = new Set();
  let correctCount = 0;
  let totalBlanks = allOriginalWords.length;

  console.log(chalk.bold('--- Fill in the blanks line by line ---'));
  for (const lineData of processedLines) {
    if (lineData.originalWordsInThisLine.length === 0) {
      console.log(lineData.blankedLineDisplay);
      continue;
    }

    console.log(`\n${lineData.blankedLineDisplay}`);
    const { userLineInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'userLineInput',
        message: `Enter the missing word(s) for this line (separated by spaces):`,
      },
    ]);

    const userAnswersForLine = userLineInput.split(' ').map(w => w.trim().toLowerCase()).filter(w => w !== '');
    const originalWordsForLine = lineData.originalWordsInThisLine.map(w => w.toLowerCase());

    let lineCorrect = true;
    for (let i = 0; i < originalWordsForLine.length; i++) {
      const originalWord = originalWordsForLine[i];
      const userAnswer = userAnswersForLine[i];

      if (userAnswer && originalWord === userAnswer) {
        console.log(`  ${chalk.green('✔')} ${originalWord}`);
        correctCount++;
      } else {
        console.log(`  ${chalk.red('✖')} Expected: ${chalk.yellow(originalWord)}, Got: ${chalk.red(userAnswer || '[empty]')}`);
        missedWordsOverall.add(originalWord);
        lineCorrect = false;
      }
    }
    if (lineCorrect) {
      console.log(chalk.green('  All correct for this line!'));
    } else {
      console.log(chalk.red('  Some errors in this line.'));
    }
  }

  console.log(chalk.bold(`\n--- Session Complete ---`));
  console.log(chalk.bold(`You got ${correctCount} out of ${totalBlanks} blanks correct!`));

  if (missedWordsOverall.size > 0) {
    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Do you want to save the words you missed to your vocabulary?',
            default: true
        }
    ]);

    if (confirm) {
        for (const word of missedWordsOverall) {
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