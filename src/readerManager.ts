import fs from 'fs';
import pathNode from 'path';
import { PDFParse } from 'pdf-parse';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ReadingProgress } from './types.js';
import { getStylisticFeedback } from './aiManager.js';
import { saveWord } from './vocabularyManager.js';
import { addXP } from './statsManager.js';
import { fetchArticle } from './webReader.js';

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

// --- PDF READER SECTION ---

export async function openPDFHub() {
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
            type: 'list',
            name: 'action',
            message: 'PDF Library:',
            choices
        }
    ]);

    switch (action) {
        case 'continue':
            if (!progress.currentBook) {
                console.log(chalk.yellow('\nNo book is currently open.\n'));
                return openPDFHub();
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

// --- WEB READER SECTION ---

export async function openWebReader() {
    const { url } = await inquirer.prompt([
        {
            type: 'input',
            name: 'url',
            message: 'Enter the URL of the article:',
            validate: (input) => input.startsWith('http') ? true : 'Please enter a valid URL.'
        }
    ]);

    const article = await fetchArticle(url);
    if (article) {
        // Split content into "pages" (approx 2000 chars each)
        const pageSize = 2000;
        const pages = [];
        for (let i = 0; i < article.content.length; i += pageSize) {
            pages.push({
                text: article.content.substring(i, i + pageSize),
                num: Math.floor(i / pageSize) + 1
            });
        }

        await displayReader(article.title, pages);
    }
}

// --- SHARED CORE LOGIC ---

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
    
    const pages = data.pages;
    await displayReader(title, pages, book.lastPageRead - 1, true);
}

async function displayReader(title: string, pages: any[], startIndex: number = 0, isBook: boolean = false) {
    let currentIndex = startIndex;
    const progress = getProgress();

    while (currentIndex < pages.length) {
        console.clear();
        console.log(chalk.blue.bold(`\n📖 ${title}`));
        console.log(chalk.gray(`Página ${currentIndex + 1} de ${pages.length}`));
        console.log(chalk.cyan('='.repeat(50)));
        console.log(`\n${pages[currentIndex].text.trim()}\n`);
        console.log(chalk.cyan('='.repeat(50)));
        console.log(chalk.italic.gray(' (Usa las flechas ↑/↓ para elegir y Enter para confirmar)\n'));

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
                if (isBook && progress.books[title]) {
                    progress.books[title].lastPageRead = currentIndex + 1;
                    saveProgress(progress);
                }
                addXP(5);
            }
        } else if (action === 'prev') {
            if (currentIndex > 0) {
                currentIndex--;
                if (isBook && progress.books[title]) {
                    progress.books[title].lastPageRead = currentIndex + 1;
                    saveProgress(progress);
                }
            }
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
            type: 'list',
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