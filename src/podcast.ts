import inquirer from 'inquirer';
import chalk from 'chalk';
import { searchShows, getShowEpisodes, getEpisode } from './spotifyManager.js';
import { saveEntry } from './journal.js';
import { saveWord } from './vocabularyManager.js';

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

  const { action } = await inquirer.prompt([{
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: '📝 Add to Journal (Log listening)', value: 'journal' },
      { name: '📚 Extract Vocabulary', value: 'vocab' },
      { name: '🔙 Back to episodes', value: 'back' },
      { name: '❌ Exit', value: 'exit' }
    ]
  }]);

  if (action === 'journal') {
    const entry = `Listened to podcast: ${selectedShow.name} - ${selectedEpisode.name}.\nDescription: ${selectedEpisode.description}`;
    await saveEntry(entry);
    console.log(chalk.green('\n✔ Added to journal!\n'));
  } else if (action === 'vocab') {
    await extractVocabularyFlow(selectedEpisode.description);
  } else if (action === 'back') {
    // Return to episodes (simplified for now)
    return interactivePodcastSession();
  }
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
