import inquirer from 'inquirer';
import chalk from 'chalk';
import { getVocabulary, saveVocabulary } from './vocabularyManager.js';
import { addXP } from './statsManager.js';
export function getWordsToReview() {
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
export async function reviewSession() {
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
        }
        else {
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
export async function practiceSentences() {
    const vocabulary = getVocabulary().filter(v => v.example);
    if (vocabulary.length === 0) {
        console.log(chalk.yellow('No words with example sentences found. Add some first!'));
        return;
    }
    console.log(chalk.cyan.bold(`\n--- Practice Sentences: ${vocabulary.length} words to practice! ---\n`));
    for (const word of vocabulary) {
        const sentence = word.example;
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
        }
        else {
            console.log(chalk.red(`Not quite. The correct answer is: ${chalk.bold(word.word)}\n`));
        }
    }
    console.log(chalk.green.bold('\nSentence practice complete! Keep it up!\n'));
}
