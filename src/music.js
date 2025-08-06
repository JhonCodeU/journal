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

    const lyricsContainers = $('[data-lyrics-container="true"], .lyrics');
    if (lyricsContainers.length === 0) return null;

    let fullText = '';
    lyricsContainers.each((i, elem) => {
        // Use .html() to preserve line breaks (<br> tags)
        const html = $(elem).html();
        // Replace <br> tags with newlines and decode HTML entities
        const text = html.replace(/<br>/g, '\n').replace(/<.*?>/g, '');
        fullText += text + '\n\n';
    });

    const sections = [];
    const lines = fullText.split('\n').filter(line => line.trim() !== '');
    let currentSection = { title: 'Intro', lines: [] };

    for (const line of lines) {
        const match = line.trim().match(/^\s*\[(.*?)\]\s*$/);
        if (match) {
            if (currentSection.lines.length > 0) {
                sections.push(currentSection);
            }
            currentSection = { title: match[1], lines: [] };
        } else {
            currentSection.lines.push(line.trim());
        }
    }
    if (currentSection.lines.length > 0) {
        sections.push(currentSection);
    }

    return sections;

  } catch (error) {
    console.error(chalk.red('Error scraping lyrics from Genius page:'), error.message);
    return null;
  }
}

function createFillInTheBlanks(sections, difficulty = 0.15) {
  const processedSections = [];
  const allOriginalWords = [];

  sections.forEach(section => {
    const processedLines = [];
    section.lines.forEach(line => {
        const wordsInLine = line.split(/(\s+)/); 
        let blankedLineDisplay = '';
        const originalWordsInThisLine = [];
        
        const fillableWords = wordsInLine.filter(w => w.trim() !== '' && w.match(/[a-zA-Z]/));
        const targetBlankedCount = Math.ceil(fillableWords.length * difficulty);
        const indicesToBlank = new Set();
        
        // Get indices of fillable words
        const fillableIndices = [];
        wordsInLine.forEach((w, i) => {
            if (w.trim() !== '' && w.match(/[a-zA-Z]/)) {
                fillableIndices.push(i);
            }
        });

        // Randomly select indices to blank
        while (indicesToBlank.size < targetBlankedCount && indicesToBlank.size < fillableIndices.length) {
            const randomIndex = Math.floor(Math.random() * fillableIndices.length);
            indicesToBlank.add(fillableIndices[randomIndex]);
        }

        wordsInLine.forEach((part, index) => {
            const cleanedPart = part.trim().replace(/[^a-zA-Z0-9'’]/g, '');
            if (indicesToBlank.has(index)) {
                originalWordsInThisLine.push(cleanedPart);
                allOriginalWords.push(cleanedPart);
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
    processedSections.push({ title: section.title, lines: processedLines });
  });

  return { processedSections, allOriginalWords };
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
  const lyricSections = await getLyricsFromGeniusPage(selectedSongUrl);

  if (!lyricSections || lyricSections.length === 0) {
    console.log(chalk.red('Could not retrieve or parse lyrics for the selected song.\n'));
    return;
  }

  console.log(chalk.green('Lyrics found! Get ready to play.\n'));
  const youtubeLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  console.log(`🎧 Listen to the song here: ${chalk.underline.blue(youtubeLink)}\n`);

  const { difficulty } = await inquirer.prompt([
    {
        type: 'list',
        name: 'difficulty',
        message: 'Select a difficulty level:',
        choices: [
            { name: 'Easy (approx. 15% of words)', value: 0.15 },
            { name: 'Medium (approx. 30% of words)', value: 0.30 },
            { name: 'Hard (approx. 50% of words)', value: 0.50 },
        ],
        default: 0.15
    }
  ]);

  const { processedSections, allOriginalWords } = createFillInTheBlanks(lyricSections, difficulty);
  const missedWordsOverall = new Set();
  let correctCount = 0;
  let totalBlanks = allOriginalWords.length;

  console.log(chalk.bold('--- Fill in the blanks section by section ---'));
  for (const section of processedSections) {
    console.log(chalk.magenta.bold(`\n--- ${section.title} ---\n`));
    for (const lineData of section.lines) {
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
        const originalWordsForLine = lineData.originalWordsInThisLine.map(w => w.toLowerCase().replace(/[^a-zA-Z0-9'’]/g, ''));

        let lineCorrect = true;
        for (let i = 0; i < originalWordsForLine.length; i++) {
            const originalWord = originalWordsForLine[i];
            const userAnswer = userAnswersForLine[i];

            if (userAnswer && originalWord === userAnswer) {
                console.log(`  ${chalk.green('✔')} ${originalWord}`);
                correctCount++;
            } else {
                console.log(`  ${chalk.red('✖')} Expected: ${chalk.yellow(originalWord)}, Got: ${chalk.red(userAnswer || '[empty]')}`);
                missedWordsOverall.add(lineData.originalWordsInThisLine[i]); // Save the original case word
                lineCorrect = false;
            }
        }
        if (lineCorrect) {
            console.log(chalk.green('  All correct for this line!'));
        } else {
            console.log(chalk.red('  Some errors in this line.'));
        }
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
                await saveWord({ word, translation });
            }
        }
    }
  }
}

module.exports = { interactiveMusicSession };

