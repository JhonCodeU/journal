import axios from 'axios';
import * as cheerio from 'cheerio';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { saveEntry } from './journal.js';
import { saveWord } from './vocabularyManager.js';
import { getPodcastSummary, getPodcastVocab } from './aiManager.js';

interface AudioSource {
  name: string;
  url: string;
  description: string;
}

const SOURCES: AudioSource[] = [
  {
    name: 'BBC 6 Minute English',
    url: 'https://podcasts.files.bbci.co.uk/p02pc9tn.rss',
    description: 'Bite-sized episodes about everyday topics. Great for intermediate learners.'
  },
  {
    name: 'VOA Learning English (General)',
    url: 'https://learningenglish.voanews.com/podcast/?count=20&zoneId=3521',
    description: 'News and features at a slower pace with simple vocabulary.'
  },
  {
    name: 'VOA Words and Their Stories',
    url: 'https://learningenglish.voanews.com/podcast/?count=20&zoneId=1579',
    description: 'Explains the origins and usage of common English idioms and expressions.'
  },
  {
      name: 'British Council - LearnEnglish',
      url: 'https://learnenglish.britishcouncil.org/general-english/podcasts/feed',
      description: 'Episodes about everyday life, perfect for improving listening skills.'
  }
];

interface Episode {
  title: string;
  description: string;
  audioUrl: string;
  link: string;
  pubDate: string;
}

async function fetchFeed(url: string): Promise<Episode[]> {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data, { xmlMode: true });
    const episodes: Episode[] = [];

    $('item').each((i, el) => {
      const title = $(el).find('title').text();
      const description = $(el).find('description').text()
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .trim();
      const audioUrl = $(el).find('enclosure').attr('url') || '';
      const link = $(el).find('link').text();
      const pubDate = $(el).find('pubDate').text();

      if (title && audioUrl) {
        episodes.push({ title, description, audioUrl, link, pubDate });
      }
    });

    return episodes;
  } catch (error) {
    console.error(chalk.red('Error fetching feed:'), error);
    return [];
  }
}

export async function interactiveAudioLibrarySession(): Promise<void> {
  console.log(chalk.cyan.bold('\n📚 Natural Audio Stories & News\n'));
  console.log(chalk.gray('Fast, natural audio from top educational sources. No login required.\n'));

  const { source } = await inquirer.prompt([{
    type: 'select',
    name: 'source',
    message: 'Select a source:',
    choices: [
      ...SOURCES.map(s => ({ name: `${s.name} - ${chalk.gray(s.description)}`, value: s })),
      { name: 'Back to main menu', value: 'back' }
    ]
  }]);

  if (source === 'back') return;

  console.log(chalk.blue(`\nFetching latest episodes from ${source.name}...`));
  const episodes = await fetchFeed(source.url);

  if (episodes.length === 0) {
    console.log(chalk.red('No episodes found. Try another source.\n'));
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

  await studyEpisode(selectedEpisode, source.name);
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
      { name: '🎧 Listen & Study (Open in browser)', value: 'listen' },
      { name: '📝 Add to Journal (Log listening)', value: 'journal' },
      { name: '📚 AI Vocabulary Extraction', value: 'vocab-ai' },
      { name: '✨ AI Summary (Spanish)', value: 'summary' },
      { name: '🔙 Back to episodes', value: 'back' }
    ]
  }]);

  switch (action) {
    case 'listen':
      console.log(chalk.green(`\nOpening audio link: ${episode.audioUrl}`));
      console.log(chalk.gray('(You can listen while following the description here or on the site)'));
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

async function extractVocabularyAIFlow(description: string) {
  console.log(chalk.blue('\nLa IA está seleccionando las mejores palabras para ti...'));
  const aiWords = await getPodcastVocab(description);

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
