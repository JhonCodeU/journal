import inquirer from 'inquirer';
import chalk from 'chalk';
import { getVocabulary, saveVocabulary } from './vocabularyManager.js';
import { addXP } from './statsManager.js';
import { VocabularyItem } from './types.js';

export function getWordsToReview(): VocabularyItem[] {
  const vocabulary = getVocabulary();
  const now = new Date();

  return vocabulary
    .filter(word => {
      const lastReviewed = word.lastReviewed ? new Date(word.lastReviewed) : new Date(0);
      const daysSinceReview = (now.getTime() - lastReviewed.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceReview >= word.strength;
    })
    .sort((a, b) => a.strength - b.strength);
}

export async function reviewSession(): Promise<void> {
  const wordsToReview = getWordsToReview();

  if (wordsToReview.length === 0) {
    console.log(chalk.green.bold('\nExcellent! You have no words to review today. Come back tomorrow!'));
    return;
  }

  console.log(chalk.cyan.bold(`\n--- Review Session: ${wordsToReview.length} words to go! ---\n`));

  let sessionXP = 0;
  for (const word of wordsToReview) {
    const { answer } = await inquirer.prompt([
      {
        type: 'input',
        name: 'answer',
        message: `What is the translation of "${chalk.yellow(word.word)}"?`,
      },
    ]);

    if (answer.toLowerCase().trim() === word.translation.toLowerCase().trim()) {
      console.log(chalk.green('Correct!\n'));
      word.strength += 1;
      sessionXP += 10;
    } else {
      console.log(chalk.red(`Not quite. The correct answer is: ${chalk.bold(word.translation)}\n`));
      word.strength = Math.max(1, word.strength - 1);
      sessionXP += 2;
    }
    word.lastReviewed = new Date().toISOString();
  }

  addXP(sessionXP);
  const vocabulary = getVocabulary();
  const updatedVocabulary = vocabulary.map(v => {
    const reviewedWord = wordsToReview.find(rw => rw.word === v.word);
    return reviewedWord || v;
  });

  saveVocabulary(updatedVocabulary);

  console.log(chalk.green.bold('\nReview session complete! Keep up the great work!\n'));
}

export async function quickReview(): Promise<void> {
  const wordsToReview = getWordsToReview();

  if (wordsToReview.length === 0) {
    console.log(chalk.green.bold('\n✅ No hay palabras pendientes. ¡Excelente!\n'));
    return;
  }

  const limit = Math.min(3, wordsToReview.length);

  const { choice } = await inquirer.prompt([{
    type: 'select',
    name: 'choice',
    message: `Tienes ${wordsToReview.length} palabras. ¿Cuántas repasas?`,
    choices: [
      { name: `⚡ Rápido (3 palabras) [~1 min]`, value: 3 },
      { name: `📚 Medio (${Math.min(7, wordsToReview.length)} palabras) [~3 min]`, value: Math.min(7, wordsToReview.length) },
      { name: `🎯 Todas (${wordsToReview.length} palabras) [~${Math.round(wordsToReview.length * 0.5)} min]`, value: wordsToReview.length },
      { name: '↩️  Cancelar', value: 0 }
    ]
  }]);

  if (choice === 0) return;

  const selected = wordsToReview.slice(0, choice);

  console.log(chalk.cyan.bold(`\n--- Quick Review: ${selected.length} palabras ---\n`));

  let sessionXP = 0;
  for (const word of selected) {
    const { answer } = await inquirer.prompt([
      {
        type: 'input',
        name: 'answer',
        message: `"${chalk.yellow(word.word)}" →`,
      },
    ]);

    if (answer.toLowerCase().trim() === word.translation.toLowerCase().trim()) {
      console.log(chalk.green('  ✔ Correcto!\n'));
      word.strength += 1;
      sessionXP += 10;
    } else {
      console.log(chalk.red(`  ✘ ${word.translation}\n`));
      word.strength = Math.max(1, word.strength - 1);
      sessionXP += 2;
    }
    word.lastReviewed = new Date().toISOString();
  }

  addXP(sessionXP);
  const vocabulary = getVocabulary();
  const updatedVocabulary = vocabulary.map(v => {
    const reviewedWord = selected.find(rw => rw.word === v.word);
    return reviewedWord || v;
  });
  saveVocabulary(updatedVocabulary);

  console.log(chalk.green.bold(`\n✔ ${selected.length} palabras repasadas. +${sessionXP} XP\n`));
}

export async function practiceSentences(): Promise<void> {
  const vocabulary = getVocabulary().filter(v => v.example);

  if (vocabulary.length === 0) {
    console.log(chalk.yellow('No words with example sentences found. Add some first!'));
    return;
  }

  console.log(chalk.cyan.bold(`\n--- Practice Sentences: ${vocabulary.length} words to practice! ---\n`));

  for (const word of vocabulary) {
    const sentence = word.example!;
    const blankedSentence = sentence.replace(new RegExp(`\\b${word.word}\\b`, 'ig'), '_____');

    const { answer } = await inquirer.prompt([
      {
        type: 'input',
        name: 'answer',
        message: `Complete the sentence: ${chalk.yellow(blankedSentence)}`,
      },
    ]);

    if (answer.toLowerCase().trim() === word.word.toLowerCase().trim()) {
      console.log(chalk.green('Correct!\n'));
      addXP(5);
    } else {
      console.log(chalk.red(`Not quite. The correct answer is: ${chalk.bold(word.word)}\n`));
    }
  }

  console.log(chalk.green.bold('\nSentence practice complete! Keep it up!\n'));
}
