import axios from 'axios';
import * as cheerio from 'cheerio';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { saveEntry } from './journal.js';
import { saveWord } from './vocabularyManager.js';
import { getPodcastSummary, getPodcastVocab } from './aiManager.js';
import { fetchArticle } from './webReader.js';
import { commonWords } from './vocabulary.js';

interface AudioSource {
  name: string;
  url: string;
  description: string;
  type: 'bbc' | 'voa' | 'generic';
}

const SOURCES: AudioSource[] = [
  {
    name: 'Maestra Miel: Slow English Podcast',
    url: 'https://feeds.acast.com/public/shows/maestra-miel-slow-english-podcast',
    description: 'Slow, clear English for A1-B1 learners. Perfect for building your ear.',
    type: 'generic'
  },
  {
    name: 'Inglés desde cero',
    url: 'https://inglesdesdecero.ca/feed/podcast/',
    description: 'Aprende inglés desde cero con explicaciones en español y nativos.',
    type: 'generic'
  },
  {
    name: 'English Learning for Curious Minds',
    url: 'https://feeds.transistor.fm/leonardo-english-english-language-learning-for-curious-minds',
    description: 'Intermediate-Advanced stories about the world.',
    type: 'generic'
  },
  {
    name: 'BBC 6 Minute English',
    url: 'https://podcasts.files.bbci.co.uk/p02pc9tn.rss',
    description: 'Bite-sized episodes about everyday topics. Great for intermediate learners.',
    type: 'bbc'
  },
  {
    name: 'VOA Learning English (General)',
    url: 'https://learningenglish.voanews.com/podcast/?count=20&zoneId=3521',
    description: 'News and features at a slower pace with simple vocabulary.',
    type: 'voa'
  },
  {
    name: 'VOA Words and Their Stories',
    url: 'https://learningenglish.voanews.com/podcast/?count=20&zoneId=1579',
    description: 'Explains the origins and usage of common English idioms and expressions.',
    type: 'voa'
  }
];

interface Episode {
  title: string;
  description: string;
  audioUrl: string;
  link: string;
  transcriptUrl: string;
  pubDate: string;
}

async function fetchFeed(url: string, sourceType: string = 'generic'): Promise<Episode[]> {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data, { xmlMode: true });
    const episodes: Episode[] = [];

    $('item').each((i, el) => {
      const title = $(el).find('title').text();
      const rawDescription = $(el).find('description').text() || $(el).find('itunes\\:summary').text();
      const description = rawDescription.replace(/<[^>]*>/g, '').trim();
      const audioUrl = $(el).find('enclosure').attr('url') || '';
      const link = $(el).find('link').text();
      const pubDate = $(el).find('pubDate').text();

      let transcriptUrl = link;
      if (sourceType === 'bbc') {
          const match = rawDescription.match(/https:\/\/www\.bbc\.co\.uk\/learningenglish\/[^\s<]*/);
          if (match) transcriptUrl = match[0];
      }

      if (title && audioUrl) {
        episodes.push({ title, description, audioUrl, link, transcriptUrl, pubDate });
      }
    });

    return episodes;
  } catch (error) {
    console.error(chalk.red('Error fetching feed:'), error);
    return [];
  }
}

async function searchItunesPodcasts(query: string): Promise<AudioSource[]> {
    try {
        const response = await axios.get('https://itunes.apple.com/search', {
            params: {
                term: query,
                media: 'podcast',
                limit: 5
            }
        });

        return response.data.results.map((res: any) => ({
            name: res.collectionName,
            url: res.feedUrl,
            description: `Artist: ${res.artistName} | Genre: ${res.primaryGenreName}`,
            type: 'generic'
        }));
    } catch (error) {
        console.error(chalk.red('Search failed:'), error);
        return [];
    }
}

export async function interactiveAudioLibrarySession(): Promise<void> {
  console.log(chalk.cyan.bold('\n📚 Natural Audio Stories & News (High Speed)\n'));

  const { source } = await inquirer.prompt([{
    type: 'select',
    name: 'source',
    message: 'Select a podcast or search:',
    choices: [
      { name: chalk.magenta.bold('🔍 Search for a new podcast...'), value: 'search' },
      new inquirer.Separator(),
      ...SOURCES.map(s => ({ name: `${s.name} - ${chalk.gray(s.description)}`, value: s })),
      { name: 'Back to main menu', value: 'back' }
    ]
  }]);

  if (source === 'back') return;

  let finalSource: AudioSource;

  if (source === 'search') {
      const { query } = await inquirer.prompt([{
          type: 'input',
          name: 'query',
          message: 'Podcast name or topic:',
      }]);
      
      console.log(chalk.blue('\nSearching...'));
      const results = await searchItunesPodcasts(query);
      
      if (results.length === 0) {
          console.log(chalk.red('No podcasts found.'));
          return interactiveAudioLibrarySession();
      }

      const { selected } = await inquirer.prompt([{
          type: 'select',
          name: 'selected',
          message: 'Select from results:',
          choices: [
              ...results.map(r => ({ name: `${r.name} (${r.description})`, value: r })),
              { name: 'Back', value: 'back' }
          ]
      }]);

      if (selected === 'back') return interactiveAudioLibrarySession();
      finalSource = selected;
  } else {
      finalSource = source;
  }

  console.log(chalk.blue(`\nFetching latest episodes from ${finalSource.name}...`));
  const episodes = await fetchFeed(finalSource.url, finalSource.type);

  if (episodes.length === 0) {
    console.log(chalk.red('No episodes found for this source.\n'));
    return interactiveAudioLibrarySession();
  }

  const { selectedEpisode } = await inquirer.prompt([{
    type: 'select',
    name: 'selectedEpisode',
    message: 'Select an episode:',
    choices: [
      ...episodes.map(ep => ({ name: ep.title, value: ep })),
      { name: 'Back to sources', value: 'back' }
    ]
  }]);

  if (selectedEpisode === 'back') return interactiveAudioLibrarySession();

  await studyEpisode(selectedEpisode, finalSource.name);
}

async function studyEpisode(episode: Episode, sourceName: string) {
  console.log(chalk.yellow.bold(`\n--- EPISODE: ${episode.title} ---`));
  console.log(chalk.cyan(`Source: `) + sourceName);
  console.log(chalk.cyan(`Date:   `) + episode.pubDate);
  console.log(chalk.cyan(`Audio:  `) + chalk.underline.blue(episode.audioUrl));
  console.log(chalk.yellow(`\nDescription:`));
  console.log(episode.description);
  console.log(chalk.yellow(`-------------------------------\n`));

  const { action } = await inquirer.prompt([{
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: '🎧 Listen & Study (Open Audio)', value: 'listen' },
      { name: '📖 Read Full Transcript (Console)', value: 'transcript' },
      { name: '📝 Add to Journal (Log listening)', value: 'journal' },
      { name: '📚 AI Vocabulary Extraction', value: 'vocab-ai' },
      { name: '✨ AI Summary (Spanish)', value: 'summary' },
      { name: '🔙 Back to episodes', value: 'back' }
    ]
  }]);

  switch (action) {
    case 'listen':
      console.log(chalk.green(`\nOpening audio link: ${episode.audioUrl}`));
      break;
    case 'transcript':
      await showTranscriptFlow(episode);
      break;
    case 'journal':
      const entry = `Listened to ${sourceName}: ${episode.title}.\n${episode.description}`;
      await saveEntry(entry);
      console.log(chalk.green('\n✔ Added to journal!\n'));
      break;
    case 'vocab-ai':
      await extractVocabularyAIFlow(episode.description);
      break;
    case 'summary':
      console.log(chalk.blue('\nGenerando resumen con IA...'));
      const summary = await getPodcastSummary(episode.title, episode.description);
      console.log(chalk.green('\n📝 RESUMEN DEL EPISODIO:'));
      console.log(chalk.white(summary));
      console.log(chalk.green('------------------------\n'));
      break;
    case 'back':
      return; 
  }

  if (action !== 'back') {
      const { continueStudy } = await inquirer.prompt([{ type: 'confirm', name: 'continueStudy', message: 'Keep studying this episode?', default: true }]);
      if (continueStudy) return studyEpisode(episode, sourceName);
  }
}

async function showTranscriptFlow(episode: Episode) {
    console.log(chalk.blue(`\nFetching transcript from ${episode.transcriptUrl}...`));
    const article = await fetchArticle(episode.transcriptUrl);

    if (!article) {
        console.log(chalk.red('Could not fetch transcript automatically.'));
        console.log(chalk.cyan('Link: ') + chalk.underline.blue(episode.transcriptUrl));
        return;
    }

    console.log(chalk.magenta.bold(`\n--- TRANSCRIPT: ${article.title} ---`));
    
    const words = article.content.match(/\b[a-zA-Z]+\b/g) || [];
    const difficultWords = new Set<string>();
    words.forEach(word => {
        const cleanedWord = word.toLowerCase();
        if (!commonWords.has(cleanedWord)) {
            difficultWords.add(word);
        }
    });

    let highlightedText = article.content;
    difficultWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        highlightedText = highlightedText.replace(regex, chalk.yellow(word));
    });

    console.log(highlightedText);
    console.log(chalk.magenta.bold('\n--- END OF TRANSCRIPT ---\n'));

    const { vocabAction } = await inquirer.prompt([{
        type: 'select',
        name: 'vocabAction',
        message: 'Vocabulary from transcript:',
        choices: [
            { name: '📚 Save difficult words (Manual)', value: 'manual' },
            { name: '✨ AI extract from transcript', value: 'ai' },
            { name: '🔙 Back', value: 'back' }
        ]
    }]);

    if (vocabAction === 'manual') {
        const { selectedWords } = await inquirer.prompt([{
            type: 'checkbox',
            name: 'selectedWords',
            message: 'Select words to save:',
            choices: Array.from(difficultWords).slice(0, 50)
        }]);

        for (const word of selectedWords) {
            const { translation } = await inquirer.prompt([{
                type: 'input',
                name: 'translation',
                message: `Translation for "${chalk.yellow(word)}":`
            }]);
            if (translation) await saveWord({ word, translation });
        }
    } else if (vocabAction === 'ai') {
        await extractVocabularyAIFlow(article.content.substring(0, 5000));
    }
}

async function extractVocabularyAIFlow(text: string) {
  console.log(chalk.blue('\nLa IA está seleccionando las mejores palabras para ti...'));
  const aiWords = await getPodcastVocab(text.substring(0, 3000));

  if (aiWords.length === 0) {
    console.log(chalk.red('No se pudieron extraer palabras con IA.\n'));
    return;
  }

  const { selectedIndices } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedIndices',
    message: 'Selecciona las que quieres guardar:',
    choices: aiWords.map((item, index) => ({
      name: `${chalk.yellow(item.word)}: ${item.translation}`,
      value: index
    })),
    default: aiWords.map((_, i) => i)
  }]);

  for (const index of selectedIndices) {
    const { word, translation } = aiWords[index];
    await saveWord({ word, translation });
  }
  
  console.log(chalk.green(`\n✔ ${selectedIndices.length} palabras guardadas al vocabulario.\n`));
}
