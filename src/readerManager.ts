import fs from 'fs';
import pathNode from 'path';
import { PDFParse } from 'pdf-parse';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ReadingProgress } from './types.js';
import { getStylisticFeedback } from './aiManager.js';
import { saveWord } from './vocabularyManager.js';
import { addXP } from './statsManager.js';

const PROGRESS_FILE = './reading_progress.json';

const INITIAL_PROGRESS: ReadingProgress = {
    currentBook: null,
    books: {}
};

function getProgress(): ReadingProgress {
    if (!fs.existsSync(PROGRESS_FILE)) return INITIAL_PROGRESS;
    try {
        return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch {
        return INITIAL_PROGRESS;
    }
}

function saveProgress(progress: ReadingProgress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

export async function openReadingHub() {
    const progress = getProgress();
    
    const choices = [
        { name: '📖 Continue Reading', value: 'continue' },
        { name: '➕ Open New PDF', value: 'open' },
        { name: '📚 My Library', value: 'library' },
        new inquirer.Separator(),
        { name: 'Go Back', value: 'back' }
    ];

    const { action } = await inquirer.prompt([
        {
            type: 'select',
            name: 'action',
            message: 'Reading Hub:',
            choices
        }
    ]);

    switch (action) {
        case 'continue':
            if (!progress.currentBook) {
                console.log(chalk.yellow('\nNo book is currently open.\n'));
                return openReadingHub();
            }
            await readBook(progress.currentBook);
            break;
        case 'open':
            await openNewPDF();
            break;
        case 'library':
            await showLibrary();
            break;
        case 'back':
            return;
    }
}

async function openNewPDF() {
    const { filePath } = await inquirer.prompt([
        {
            type: 'input',
            name: 'filePath',
            message: 'Enter the path to the PDF file:',
            validate: (input) => fs.existsSync(input) && input.endsWith('.pdf') ? true : 'Please enter a valid PDF path.'
        }
    ]);

    const dataBuffer = fs.readFileSync(filePath);
    try {
        console.log(chalk.blue('\nAnalyzing PDF...'));
        const parser = new PDFParse({ data: dataBuffer });
        const data = await parser.getText();
        
        const title = pathNode.basename(filePath);
        const progress = getProgress();

        progress.books[title] = {
            totalPages: data.total,
            lastPageRead: 1,
            path: pathNode.resolve(filePath)
        };
        progress.currentBook = title;
        saveProgress(progress);

        console.log(chalk.green(`\nSuccess! "${title}" added to your library.`));
        await readBook(title);
    } catch (error: any) {
        console.log(chalk.red(`\nError reading PDF: ${error.message}`));
    }
}

async function readBook(title: string) {
    const progress = getProgress();
    const book = progress.books[title];
    
    const dataBuffer = fs.readFileSync(book.path);
    const parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();
    
    // In this version, data.text is the concatenated text
    // data.pages is an array of { text, num }
    const pages = data.pages;
    
    let currentIndex = book.lastPageRead - 1;

    while (currentIndex < pages.length) {
        console.clear();
        console.log(chalk.blue.bold(`\n📖 ${title} | Page ${pages[currentIndex].num} of ${data.total}`));
        console.log(chalk.cyan('='.repeat(50)));
        console.log(`\n${pages[currentIndex].text.trim()}\n`);
        console.log(chalk.cyan('='.repeat(50)));

        const { action } = await inquirer.prompt([
            {
                type: 'select',
                name: 'action',
                message: 'Controls:',
                choices: [
                    { name: '➡️ Next Page', value: 'next' },
                    { name: '⬅️ Previous Page', value: 'prev' },
                    { name: '🤖 Ask AI to Explain this part', value: 'explain' },
                    { name: '💾 Save Vocabulary', value: 'vocab' },
                    { name: '🚪 Close Book', value: 'exit' }
                ]
            }
        ]);

        if (action === 'next') {
            if (currentIndex < pages.length - 1) {
                currentIndex++;
                book.lastPageRead = currentIndex + 1;
                saveProgress(progress);
                addXP(5); // XP for reading a page
            }
        } else if (action === 'prev') {
            if (currentIndex > 0) currentIndex--;
        } else if (action === 'explain') {
            console.log(chalk.blue('\nAI is analyzing this part...'));
            const explanation = await getStylisticFeedback(`Explain this part and summarize it simply: ${pages[currentIndex].text}`);
            console.log(chalk.magenta.bold('\n--- AI Explanation ---'));
            console.log(explanation);
            console.log(chalk.magenta.bold('----------------------'));
            await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Press Enter to continue...' }]);
        } else if (action === 'vocab') {
            const { word } = await inquirer.prompt([{ type: 'input', name: 'word', message: 'Enter the word you want to save:' }]);
            if (word) {
                const { translation } = await inquirer.prompt([{ type: 'input', name: 'translation', message: `Spanish translation for "${word}":` }]);
                if (translation) {
                    await saveWord({ word, translation });
                    addXP(10);
                }
            }
        } else if (action === 'exit') {
            break;
        }
    }
}

async function showLibrary() {
    const progress = getProgress();
    const bookTitles = Object.keys(progress.books);

    if (bookTitles.length === 0) {
        console.log(chalk.yellow('\nYour library is empty.\n'));
        return;
    }

    const { selectedTitle } = await inquirer.prompt([
        {
            type: 'select',
            name: 'selectedTitle',
            message: 'Select a book to read:',
            choices: [...bookTitles, 'Back']
        }
    ]);

    if (selectedTitle === 'Back') return;
    
    const progressUpdate = getProgress();
    progressUpdate.currentBook = selectedTitle;
    saveProgress(progressUpdate);
    await readBook(selectedTitle);
}