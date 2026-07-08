import fs from 'fs';
import pathNode from 'path';
import { PDFParse } from 'pdf-parse';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ReadingProgress } from './types.js';
import { getStylisticFeedback, simplifyToA2, getBilingualPage, getPageAnalysis, getBatchTranslations } from './aiManager.js';
import { saveWord, getVocabulary } from './vocabularyManager.js';
import { commonWords } from './vocabulary.js';
import { addXP } from './statsManager.js';
import { fetchArticle } from './webReader.js';
import { spawn, ChildProcess } from 'child_process';

const PROGRESS_FILE = './reading_progress.json';
let currentAudioProcess: ChildProcess | null = null;

function stopAudio() {
    if (currentAudioProcess) {
        currentAudioProcess.kill();
        currentAudioProcess = null;
    }
}

function speak(text: string, rate: string = '-15%') {
    stopAudio();

    const cleanText = text
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 1500);

    const timestamp = Date.now();
    const tempRaw = `/tmp/tts_raw_${timestamp}.mp3`;
    const tempNorm = `/tmp/tts_norm_${timestamp}.mp3`;
    const textFile = `/tmp/tts_text_${timestamp}.txt`;
    const edgeTtsPath = '/home/dat-pt74/.local/bin/edge-tts';

    fs.writeFileSync(textFile, cleanText, 'utf8');
    console.log(chalk.yellow('  ⏳ Generando audio...'));

    const tts = spawn(edgeTtsPath, [
        '--voice', 'en-US-JennyNeural',
        `--rate=${rate}`,
        '--file', textFile,
        '--write-media', tempRaw
    ]);

    let ttsError = '';
    tts.stderr.on('data', (data) => {
        ttsError += data.toString();
    });

    currentAudioProcess = tts;

    tts.on('close', (code) => {
        if (code !== 0) {
            console.error(chalk.red('\n❌ Error generando audio TTS.'));
            if (ttsError) {
                console.error(chalk.red(`Detalles: ${ttsError}`));
            }
            fs.rmSync(textFile, { force: true });
            currentAudioProcess = null;
            return;
        }

        const ffmpeg = spawn('ffmpeg', [
            '-i', tempRaw,
            '-af', 'loudnorm=I=-9:TP=-0.5:LRA=11,volume=1.5',
            '-ar', '44100',
            tempNorm,
            '-y', '-loglevel', 'quiet'
        ]);

        currentAudioProcess = ffmpeg;

        ffmpeg.on('close', (code) => {
            fs.rmSync(tempRaw, { force: true });
            fs.rmSync(textFile, { force: true });

            if (code !== 0) {
                console.error(chalk.red('\n❌ Error normalizando audio.'));
                currentAudioProcess = null;
                return;
            }

            const vlc = spawn('cvlc', [
                '-I', 'dummy',
                '--no-video',
                '--volume', '512',
                '--play-and-exit',
                tempNorm
            ], { stdio: 'ignore' });

            currentAudioProcess = vlc;

            vlc.on('close', () => {
                fs.rmSync(tempNorm, { force: true });
                currentAudioProcess = null;
            });
        });
    });
}

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

// ─── Vocabulario y Highlighting ──────────────────────────────────────────────

function extractUncommonWordsFromText(text: string): string[] {
    const words = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
    const unique = new Set<string>();
    const vocab = getVocabulary();
    const knownWords = new Set(vocab.map(v => v.word.toLowerCase()));

    for (const word of words) {
        const clean = word.toLowerCase();
        if (!commonWords.has(clean) && !knownWords.has(clean)) {
            unique.add(word);
        }
    }
    return Array.from(unique).sort();
}

function highlightDifficultWords(text: string): string {
    const words = text.match(/\b[a-zA-Z]+\b/g) || [];
    const difficult = new Set<string>();
    const vocab = getVocabulary();
    const knownWords = new Set(vocab.map(v => v.word.toLowerCase()));

    for (const word of words) {
        const clean = word.toLowerCase();
        if (!commonWords.has(clean) && !knownWords.has(clean)) {
            difficult.add(word);
        }
    }

    let highlighted = text;
    for (const word of difficult) {
        highlighted = highlighted.replace(
            new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
            chalk.yellow(word)
        );
    }
    return highlighted;
}

function extractContextSentence(text: string, word: string): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const found = sentences.find(s =>
        new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s)
    );
    return found ? found.trim().substring(0, 120) : text.substring(0, 100);
}

async function batchSavePageVocab(words: string[], pageText: string): Promise<void> {
    if (words.length === 0) return;

    const { selectedWords } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedWords',
        message: `Palabras nuevas en esta página (${words.length}):`,
        choices: words.slice(0, 25).map(w => ({ name: w, value: w, checked: true })),
        loop: false,
    }]);

    if (selectedWords.length === 0) {
        console.log(chalk.dim('  Ninguna palabra guardada.\n'));
        return;
    }

    console.log(chalk.blue('  Traduciendo con IA...'));
    const translations = await getBatchTranslations(selectedWords);

    let saved = 0;
    for (const t of translations) {
        if (t.translation) {
            const context = extractContextSentence(pageText, t.word);
            await saveWord({ word: t.word, translation: t.translation, context });
            saved++;
        }
    }
    if (saved > 0) {
        console.log(chalk.green(`\n✔ ${saved} palabras guardadas con contexto.\n`));
        addXP(saved * 10);
    }
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
        const pageText = pages[currentIndex].text.trim();
        const uncommon = extractUncommonWordsFromText(pageText);

        console.clear();
        console.log(chalk.blue.bold(`\n📖 ${title}`));
        console.log(chalk.gray(`Página ${currentIndex + 1} de ${pages.length}`));
        console.log(chalk.cyan('='.repeat(50)));

        // Highlighted text
        console.log(`\n${highlightDifficultWords(pageText)}\n`);
        console.log(chalk.cyan('='.repeat(50)));

        // Uncommon words bar
        if (uncommon.length > 0) {
            const displayWords = uncommon.slice(0, 12);
            console.log(chalk.yellow(`\n📝 ${uncommon.length} palabra${uncommon.length !== 1 ? 's' : ''} nueva${uncommon.length !== 1 ? 's' : ''}: `) + 
                displayWords.join(', ') +
                (uncommon.length > 12 ? chalk.dim(`... (+${uncommon.length - 12} más)`) : ''));
        } else {
            console.log(chalk.green('\n✅ Todas las palabras de esta página son conocidas.\n'));
        }

        console.log(chalk.italic.gray('\n(Usa las flechas ↑/↓ para elegir y Enter para confirmar)\n'));

        const { action } = await inquirer.prompt([
            {
                type: 'select',
                name: 'action',
                message: 'Controles de lectura:',
                choices: [
                    { name: '➡️  Siguiente Página', value: 'next', disabled: currentIndex >= pages.length - 1 ? '(Última página)' : false },
                    { name: '⬅️  Página Anterior', value: 'prev', disabled: currentIndex === 0 ? '(Primera página)' : false },
                    { name: '🔊  Escuchar (Normal)', value: 'speak' },
                    { name: '🐢  Escuchar Lento (para estudiar)', value: 'speak_slow' },
                    { name: '🐇  Escuchar Rápido (práctica avanzada)', value: 'speak_fast' },
                    { name: '🔇  Detener Narración', value: 'stop' },
                    { name: '📝  Guardar vocabulario de esta página', value: 'savePageVocab' },
                    { name: '🔍  Buscar palabra', value: 'lookup' },
                    { name: '🌐  Ver Traducción Bilingüe (IA)', value: 'bilingual' },
                    { name: '🧠  Analizar Vocabulario y Expresiones (IA)', value: 'analyze' },
                    { name: '✨  Simplificar a nivel A2 (IA)', value: 'simplify' },
                    { name: '🤖  IA: Explicar esta parte', value: 'explain' },
                    { name: '🚪  Cerrar', value: 'exit' }
                ]
            }
        ]);

        // ── Auto-prompt on page leave ──
        if (action === 'next' || action === 'prev') {
            if (uncommon.length > 0) {
                const { saveVocab } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'saveVocab',
                    message: `📚 ¿Guardar ${uncommon.length} palabra${uncommon.length !== 1 ? 's' : ''} de esta página al vocabulario?`,
                    default: false,
                }]);
                if (saveVocab) {
                    await batchSavePageVocab(uncommon, pageText);
                }
            }
        }

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
        } else if (action === 'speak') {
            console.log(chalk.blue('\nNarrando a velocidad normal...'));
            speak(pageText, '-15%');
        } else if (action === 'speak_slow') {
            console.log(chalk.blue('\nNarrando lento para estudiar...'));
            speak(pageText, '-30%');
        } else if (action === 'speak_fast') {
            console.log(chalk.blue('\nNarrando rápido...'));
            speak(pageText, '+10%');
        } else if (action === 'stop') {
            console.log(chalk.yellow('\nNarración detenida.'));
            stopAudio();
        } else if (action === 'lookup') {
            const { word } = await inquirer.prompt([{
                type: 'input',
                name: 'word',
                message: '🔍 Palabra a buscar:',
            }]);
            if (word.trim()) {
                const translations = await getBatchTranslations([word.trim()]);
                if (translations[0]?.translation) {
                    console.log(chalk.green(`\n  ${word.trim()} → ${translations[0].translation}`));
                    const context = extractContextSentence(pageText, word.trim());
                    if (context) {
                        console.log(chalk.dim(`  Contexto: "${context}"`));
                    }
                } else {
                    console.log(chalk.yellow('\n  No se pudo traducir.\n'));
                }
                await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Enter para continuar...' }]);
            }
        } else if (action === 'savePageVocab') {
            await batchSavePageVocab(uncommon, pageText);
        } else if (action === 'bilingual') {
            console.log(chalk.blue('\nTraduciendo página con IA...'));
            const bilingual = await getBilingualPage(pageText);
            console.clear();
            console.log(chalk.blue.bold(`\n📖 MODO BILINGÜE: ${title} (Pag. ${currentIndex + 1})`));
            console.log(chalk.cyan('='.repeat(50)));
            const lines = bilingual.split('\n');
            for (const line of lines) {
                if (line.startsWith('ES: ')) {
                    console.log(chalk.italic.cyan(`  ${line}`));
                } else if (line.trim()) {
                    console.log(chalk.white(`  ${line}`));
                }
            }
            console.log(chalk.cyan('='.repeat(50)));
            await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Presiona Enter para volver...' }]);
        } else if (action === 'analyze') {
            console.log(chalk.blue('\nExtrayendo vocabulario y expresiones con IA...'));
            const analysis = await getPageAnalysis(pageText);
            console.log(chalk.green.bold('\n--- ANÁLISIS DE LA PÁGINA ---'));
            console.log(analysis);
            console.log(chalk.green.bold('----------------------------'));
            await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Presiona Enter para volver...' }]);
        } else if (action === 'simplify') {
            console.log(chalk.blue('\nSimplificando texto para nivel A2...'));
            const simplified = await simplifyToA2(pageText);
            console.clear();
            console.log(chalk.blue.bold(`\n✨ MODO SIMPLIFICADO A2 ✨`));
            console.log(chalk.cyan('='.repeat(50)));
            console.log(`\n${simplified}\n`);
            console.log(chalk.cyan('='.repeat(50)));
            await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Presiona Enter para volver al texto original...' }]);
        } else if (action === 'explain') {
            console.log(chalk.blue('\nAnalizando con IA...'));
            const explanation = await getStylisticFeedback(`Explica esta parte de forma sencilla en inglés y español: ${pageText}`);
            console.log(chalk.magenta.bold('\n--- Explicación del Tutor ---'));
            console.log(explanation);
            console.log(chalk.magenta.bold('----------------------------'));
            await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Presiona Enter para volver a la lectura...' }]);
        } else if (action === 'exit') {
            stopAudio();
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
