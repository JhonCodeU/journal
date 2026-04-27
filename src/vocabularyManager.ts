import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import axios from 'axios';
import { VocabularyItem } from './types.js';

const VOCAB_FILE = './vocabulary.json';
const DICTIONARY_API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';

export function getVocabulary(): VocabularyItem[] {
  if (!fs.existsSync(VOCAB_FILE)) {
    return [];
  }
  const content = fs.readFileSync(VOCAB_FILE, 'utf8');
  let vocabulary: VocabularyItem[] = [];
  try {
    vocabulary = JSON.parse(content);
  } catch (e) {
    console.error(chalk.red('Error parsing vocabulary.json'));
    return [];
  }

  let migrationNeeded = false;
  if (vocabulary.length > 0) {
    if (!vocabulary[0].hasOwnProperty('strength') || !vocabulary[0].hasOwnProperty('example')) {
      migrationNeeded = true;
      console.log(chalk.yellow('Migrating vocabulary to new format...'));
      vocabulary = vocabulary.map(item => ({
        word: item.word,
        translation: item.translation,
        strength: item.strength || 1,
        lastReviewed: item.lastReviewed || new Date(0).toISOString(),
        example: item.example || null,
      }));
    }
  }

  if (migrationNeeded) {
    saveVocabulary(vocabulary);
    console.log(chalk.green('Migration complete!'));
  }

  return vocabulary;
}

export function saveVocabulary(vocabulary: VocabularyItem[]): void {
  fs.writeFileSync(VOCAB_FILE, JSON.stringify(vocabulary, null, 2));
}

export async function saveWord({ word, translation }: { word: string, translation: string }): Promise<void> {
  const vocabulary = getVocabulary();
  if (vocabulary.some(v => v.word.toLowerCase() === word.toLowerCase())) {
    console.log(chalk.yellow(`"${word}" is already in your vocabulary.`));
    return;
  }

  let example: string | null = null;
  try {
    const response = await axios.get(`${DICTIONARY_API_URL}/${word}`);
    const data = response.data[0];
    const definitionWithExample = data.meanings
      .flatMap((m: any) => m.definitions)
      .find((d: any) => d.example);
    if (definitionWithExample) {
      example = definitionWithExample.example;
    }
  } catch (error) {
    // Dictionary API fail is non-fatal
  }

  const newWord: VocabularyItem = {
    word,
    translation,
    strength: 1,
    lastReviewed: new Date(0).toISOString(),
    example,
  };
  vocabulary.push(newWord);
  saveVocabulary(vocabulary);
  console.log(chalk.green(`Saved "${word}" to your vocabulary.`));
}

export async function getWordDetails(word: string): Promise<void> {
  try {
    console.log(chalk.blue(`\nFetching details for "${word}"...`));
    const response = await axios.get(`${DICTIONARY_API_URL}/${word}`);
    const data = response.data[0];

    const phonetic = data.phonetic || (data.phonetics.find((p: any) => p.text) || {}).text;
    
    let definition = 'N/A';
    let example = 'N/A';

    if (data.meanings && data.meanings.length > 0) {
      const firstMeaning = data.meanings[0];
      if (firstMeaning.definitions && firstMeaning.definitions.length > 0) {
        definition = firstMeaning.definitions[0].definition;
      }

      const definitionWithExample = data.meanings
        .flatMap((m: any) => m.definitions)
        .find((d: any) => d.example);
      if (definitionWithExample) {
        example = definitionWithExample.example;
      }
    }

    console.log(chalk.cyan.bold(`\n--- Details for ${word} ---\n`));
    console.log(`${chalk.yellow('Phonetic:')} ${phonetic || 'N/A'}`);
    console.log(`${chalk.yellow('Definition:')} ${definition}`);
    console.log(`${chalk.yellow('Example:')} ${example}`);
    console.log('\n------------------------\n');

  } catch (error) {
    console.log(chalk.red('Could not fetch dictionary details for this word.\n'));
  }
}

export async function viewVocabulary(): Promise<void> {
  const vocabulary = getVocabulary();
  if (vocabulary.length === 0) {
    console.log(chalk.yellow('Your vocabulary is empty.'));
    return;
  }

  const choices: any[] = vocabulary.map(item => ({
    name: `${chalk.yellow(item.word)} (${chalk.blue('Strength:' + item.strength)}) - ${item.translation}`,
    value: item.word,
  }));

  choices.push(new inquirer.Separator());
  choices.push({ name: 'Back to main menu', value: 'back' });

  const { selectedWord } = await inquirer.prompt([
    {
      type: 'select',
      name: 'selectedWord',
      message: 'Select a word to view details:',
      choices: choices,
      loop: false
    },
  ]);

  if (selectedWord === 'back') {
    return;
  }

  await getWordDetails(selectedWord);

  await inquirer.prompt([{ 
      type: 'input',
      name: 'continue',
      message: 'Press Enter to return to your vocabulary list...', 
  }]);

  await viewVocabulary();
}
