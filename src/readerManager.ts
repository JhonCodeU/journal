import fs from 'fs';
import pathNode from 'path';
import { PDFParse } from 'pdf-parse';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ReadingProgress } from './types.js';
import { getStylisticFeedback, simplifyToA2 } from './aiManager.js';
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
    try {
        const progress = getProgress();
        
        const choices = [
            { name: '📖 Continuar Leyendo', value: 'continue' },
            { name: '➕ Abrir Nuevo PDF', value: 'open' },
            { name: '📚 Mi Biblioteca', value: 'library' },
            new inquirer.Separator(),
            { name: 'Volver', value: 'back' }
        ];

        const { action } = await inquirer.prompt([
            {
                type: 'select',
                name: 'action',
                message: 'Biblioteca PDF:',
                choices
            }
        ]);

        switch (action) {
            case 'continue':
                if (!progress.currentBook) {
                    console.log(chalk.yellow('\nNo hay ningún libro abierto.\n'));
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
    } catch (error: any) {
        console.error(chalk.red(`\nError en el Hub de PDF: ${error.message}`));
    }
}

// --- WEB READER SECTION ---

export async function openWebReader() {
    const { url } = await inquirer.prompt([
        {
            type: 'input',
            name: 'url',
            message: 'Introduce la URL del artículo:',
            validate: (input) => input.startsWith('http') ? true : 'Por favor, introduce una URL válida.'
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
            message: 'Introduce la ruta al archivo PDF:',
            validate: (input) => fs.existsSync(input) && input.endsWith('.pdf') ? true : 'Por favor, introduce una ruta de PDF válida.'
        }
    ]);

    const dataBuffer = fs.readFileSync(filePath);
    try {
        console.log(chalk.blue('\nAnalizando PDF...'));
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

        console.log(chalk.green(`\n¡Éxito! "${title}" añadido a tu biblioteca.`));
        await readBook(title);
    } catch (error: any) {
        console.log(chalk.red(`\nError leyendo PDF: ${error.message}`));
    }
}

async function readBook(title: string) {
    try {
        const progress = getProgress();
        const book = progress.books[title];
        
        if (!fs.existsSync(book.path)) {
            console.log(chalk.red(`\nError: No se encontró el archivo en ${book.path}`));
            return;
        }

        console.log(chalk.blue(`\nCargando "${title}"...`));
        const dataBuffer = fs.readFileSync(book.path);
        
        console.log(chalk.blue('Analizando contenido del PDF...'));
        const parser = new (PDFParse as any)({ data: dataBuffer });
        const data = await parser.getText();
        
        const pages = data.pages;
        console.log(chalk.green('¡Listo!\n'));
        await displayReader(title, pages, book.lastPageRead - 1, true);
    } catch (error: any) {
        console.error(chalk.red(`\nError al abrir el libro: ${error.message}`));
    }
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
                message: 'Controles de lectura:',
                choices: [
                    { name: '➡️  Siguiente Página', value: 'next', disabled: currentIndex >= pages.length - 1 ? '(Última página)' : false },
                    { name: '⬅️  Página Anterior', value: 'prev', disabled: currentIndex === 0 ? '(Primera página)' : false },
                    { name: '✨  Simplificar a nivel A2 (IA)', value: 'simplify' },
                    { name: '🤖  IA: Explicar esta parte', value: 'explain' },
                    { name: '💾  Guardar Vocabulario', value: 'vocab' },
                    { name: '🚪  Cerrar', value: 'exit' }
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
        } else if (action === 'simplify') {
            console.log(chalk.blue('\nSimplificando texto para nivel A2...'));
            const simplified = await simplifyToA2(pages[currentIndex].text);
            console.clear();
            console.log(chalk.blue.bold(`\n✨ MODO SIMPLIFICADO A2 ✨`));
            console.log(chalk.cyan('='.repeat(50)));
            console.log(`\n${simplified}\n`);
            console.log(chalk.cyan('='.repeat(50)));
            await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Presiona Enter para volver al texto original...' }]);
        } else if (action === 'explain') {
            console.log(chalk.blue('\nAnalizando con IA...'));
            const explanation = await getStylisticFeedback(`Explica esta parte de forma sencilla en inglés y español: ${pages[currentIndex].text}`);
            console.log(chalk.magenta.bold('\n--- Explicación del Tutor ---'));
            console.log(explanation);
            console.log(chalk.magenta.bold('----------------------------'));
            await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Presiona Enter para volver a la lectura...' }]);
        } else if (action === 'vocab') {
            const { word } = await inquirer.prompt([{ type: 'input', name: 'word', message: 'Palabra que quieres guardar:' }]);
            if (word) {
                const { translation } = await inquirer.prompt([{ type: 'input', name: 'translation', message: `Traducción al español para "${word}":` }]);
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
        console.log(chalk.yellow('\nTu biblioteca está vacía.\n'));
        return;
    }

    const { selectedTitle } = await inquirer.prompt([
        {
            type: 'select',
            name: 'selectedTitle',
            message: 'Selecciona un libro para leer:',
            choices: [...bookTitles, 'Volver']
        }
    ]);

    if (selectedTitle === 'Volver') return;
    
    const progressUpdate = getProgress();
    progressUpdate.currentBook = selectedTitle;
    saveProgress(progressUpdate);
    await readBook(selectedTitle);
}