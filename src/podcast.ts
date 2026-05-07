import inquirer from 'inquirer';
import chalk from 'chalk';
import { searchShows, getShowEpisodes, getEpisode } from './spotifyManager.js';
import { saveEntry } from './journal.js';
import { saveWord } from './vocabularyManager.js';
import { getPodcastSummary, getPodcastVocab } from './aiManager.js';

export async function interactivePodcastSession(): Promise<void> {
  console.log(chalk.cyan.bold('\n🎙️  Spotify Podcast Study Session\n'));

  const { query } = await inquirer.prompt([{
    type: 'input',
    name: 'query',
    message: 'Search for a podcast (show):',
    default: '6 Minute English'
  }]);

  console.log(chalk.blue('\nSearching on Spotify...'));
  const shows = await searchShows(query);

  if (shows.length === 0) {
    console.log(chalk.red('No podcasts found.\n'));
    return;
  }

  const { selectedShow } = await inquirer.prompt([{
    type: 'select',
    name: 'selectedShow',
    message: 'Select a podcast:',
    choices: [
      ...shows.map((show: any) => ({
        name: `${show.name} (${show.publisher})`,
        value: show
      })),
      { name: 'Back to menu', value: 'back' }
    ]
  }]);

  if (selectedShow === 'back') return;

  console.log(chalk.blue(`\nFetching episodes for "${selectedShow.name}"...`));
  const episodes = await getShowEpisodes(selectedShow.id);

  if (episodes.length === 0) {
    console.log(chalk.red('No episodes found for this podcast.\n'));
    return;
  }

  const { selectedEpisode } = await inquirer.prompt([{
    type: 'select',
    name: 'selectedEpisode',
    message: 'Select an episode to study:',
    choices: [
      ...episodes.map((ep: any) => ({
        name: ep.name,
        value: ep
      })),
      { name: 'Back', value: 'back' }
    ]
  }]);

  if (selectedEpisode === 'back') return interactivePodcastSession();

  // Detail view
  console.log(chalk.yellow.bold(`\n--- EPISODE DETAILS ---`));
  console.log(chalk.cyan(`Title: `) + selectedEpisode.name);
  console.log(chalk.cyan(`Date:  `) + selectedEpisode.release_date);
  console.log(chalk.cyan(`Link:  `) + chalk.underline.blue(selectedEpisode.external_urls.spotify));
  console.log(chalk.yellow(`\nDescription:`));
  console.log(selectedEpisode.description);
  console.log(chalk.yellow(`------------------------\n`));

  // AI Summary Option
  const { viewSummary } = await inquirer.prompt([{
    type: 'confirm',
    name: 'viewSummary',
    message: '¿Quieres generar un resumen de este episodio con IA?',
    default: true
  }]);

  if (viewSummary) {
    console.log(chalk.blue('\nGenerando resumen con IA...'));
    const summary = await getPodcastSummary(selectedEpisode.name, selectedEpisode.description);
    console.log(chalk.green('\n📝 RESUMEN DEL EPISODIO:'));
    console.log(chalk.white(summary));
    console.log(chalk.green('------------------------\n'));
  }

  const { action } = await inquirer.prompt([{
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: '📝 Add to Journal (Log listening)', value: 'journal' },
      { name: '📚 AI Vocabulary (Extract best words)', value: 'vocab-ai' },
      { name: '🔍 Manual Vocabulary (Pick from description)', value: 'vocab-manual' },
      { name: '🔙 Back to episodes', value: 'back' },
      { name: '❌ Exit', value: 'exit' }
    ]
  }]);

  if (action === 'journal') {
    const entry = `Listened to podcast: ${selectedShow.name} - ${selectedEpisode.name}.\nDescription: ${selectedEpisode.description}`;
    await saveEntry(entry);
    console.log(chalk.green('\n✔ Added to journal!\n'));
  } else if (action === 'vocab-ai') {
    await extractVocabularyAIFlow(selectedEpisode.description);
  } else if (action === 'vocab-manual') {
    await extractVocabularyFlow(selectedEpisode.description);
  } else if (action === 'back') {
    return interactivePodcastSession();
  }
}

async function extractVocabularyAIFlow(description: string) {
  console.log(chalk.blue('\nLa IA está seleccionando las mejores palabras para ti...'));
  const aiWords = await getPodcastVocab(description);

  if (aiWords.length === 0) {
    console.log(chalk.red('No se pudieron extraer palabras con IA.\n'));
    return;
  }

  console.log(chalk.cyan('\nPalabras sugeridas por la IA:'));
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

async function extractVocabularyFlow(text: string) {
  const words = text.split(/[\s,.;:!?()"]+/).filter(w => w.length > 3);
  const uniqueWords = Array.from(new Set(words)).slice(0, 20); // Limit choices

  const { selectedWords } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedWords',
    message: 'Select words to add to your vocabulary:',
    choices: uniqueWords
  }]);

  for (const word of selectedWords) {
    const { translation } = await inquirer.prompt([{
      type: 'input',
      name: 'translation',
      message: `Translation for "${chalk.yellow(word)}":`
    }]);

    if (translation.trim()) {
      await saveWord({ word, translation: translation.trim() });
    }
  }
  console.log(chalk.green('\n✔ Vocabulary updated!\n'));
}
