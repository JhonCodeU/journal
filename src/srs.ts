import inquirer from 'inquirer';
import chalk from 'chalk';
import { getVocabulary, saveVocabulary } from './vocabularyManager.js';
import { addXP } from './statsManager.js';
import { VocabularyItem } from './types.js';
import { checkAnswer, scheduleReview, wordRegExp } from './utils.js';

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

/**
 * Asks each word, grades it (correct / typo / wrong), reschedules it with SM-2
 * and saves the vocabulary. Returns the XP earned.
 */
async function runReview(words: VocabularyItem[], compact: boolean): Promise<number> {
  let sessionXP = 0;
  const reviewed = new Map<string, VocabularyItem>();

  for (const word of words) {
    const { answer } = await inquirer.prompt([
      {
        type: 'input',
        name: 'answer',
        message: compact
          ? `"${chalk.yellow(word.word)}" →`
          : `What is the translation of "${chalk.yellow(word.word)}"?`,
      },
    ]);

    const result = checkAnswer(answer, word.translation);
    let quality: number;

    if (result === 'correct') {
      console.log(chalk.green(compact ? '  ✔ Correcto!\n' : 'Correct!\n'));
      quality = 5;
      sessionXP += 10;
    } else if (result === 'typo') {
      console.log(chalk.yellow(`  ≈ Almost! Check the spelling: ${chalk.bold(word.translation)}\n`));
      quality = 4;
      sessionXP += 7;
    } else {
      console.log(chalk.red(compact
        ? `  ✘ ${word.translation}\n`
        : `Not quite. The correct answer is: ${chalk.bold(word.translation)}\n`));
      quality = 1;
      sessionXP += 2;
    }

    const updated = scheduleReview(word, quality);
    reviewed.set(word.word, updated);
    if (!compact) {
      console.log(chalk.gray(`  Next review in ${updated.strength} day(s).\n`));
    }
  }

  saveVocabulary(getVocabulary().map(v => reviewed.get(v.word) ?? v));
  addXP(sessionXP);
  return sessionXP;
}

export async function reviewSession(): Promise<void> {
  const wordsToReview = getWordsToReview();

  if (wordsToReview.length === 0) {
    console.log(chalk.green.bold('\nExcellent! You have no words to review today. Come back tomorrow!'));
    return;
  }

  console.log(chalk.cyan.bold(`\n--- Review Session: ${wordsToReview.length} words to go! ---\n`));
  await runReview(wordsToReview, false);
  console.log(chalk.green.bold('\nReview session complete! Keep up the great work!\n'));
}

export async function quickReview(): Promise<void> {
  const wordsToReview = getWordsToReview();

  if (wordsToReview.length === 0) {
    console.log(chalk.green.bold('\n✅ No hay palabras pendientes. ¡Excelente!\n'));
    return;
  }

  const { choice } = await inquirer.prompt([{
    type: 'select',
    name: 'choice',
    message: `Tienes ${wordsToReview.length} palabras. ¿Cuántas repasas?`,
    choices: [
      { name: `⚡ Rápido (${Math.min(3, wordsToReview.length)} palabras) [~1 min]`, value: Math.min(3, wordsToReview.length) },
      { name: `📚 Medio (${Math.min(7, wordsToReview.length)} palabras) [~3 min]`, value: Math.min(7, wordsToReview.length) },
      { name: `🎯 Todas (${wordsToReview.length} palabras) [~${Math.round(wordsToReview.length * 0.5)} min]`, value: wordsToReview.length },
      { name: '↩️  Cancelar', value: 0 }
    ]
  }]);

  if (choice === 0) return;

  const selected = wordsToReview.slice(0, choice);
  console.log(chalk.cyan.bold(`\n--- Quick Review: ${selected.length} palabras ---\n`));
  const sessionXP = await runReview(selected, true);
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
    const blankedSentence = sentence.replace(wordRegExp(word.word, 'ig'), '_____');

    const { answer } = await inquirer.prompt([
      {
        type: 'input',
        name: 'answer',
        message: `Complete the sentence: ${chalk.yellow(blankedSentence)}`,
      },
    ]);

    if (checkAnswer(answer, word.word) !== 'wrong') {
      console.log(chalk.green('Correct!\n'));
      addXP(5);
    } else {
      console.log(chalk.red(`Not quite. The correct answer is: ${chalk.bold(word.word)}\n`));
    }
  }

  console.log(chalk.green.bold('\nSentence practice complete! Keep it up!\n'));
}
