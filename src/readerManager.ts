import fs from 'fs';
import pathNode from 'path';
import { PDFParse } from 'pdf-parse';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ReadingProgress } from './types.js';
import { getStylisticFeedback, simplifyToA2, getPageAnalysis, getBatchTranslations, getPodcastVocab, translatePhrase } from './aiManager.js';
import { saveWord, getVocabulary, markWordAsKnown } from './vocabularyManager.js';
import { commonWords } from './vocabulary.js';
import { addXP } from './statsManager.js';
import { fetchArticle } from './webReader.js';
import { splitIntoSentences } from './sentenceSplitter.js';
import { generateSentenceAudio, playAudioFile, stopAudio, togglePauseAudio, currentAudioProcess } from './ttsManager.js';

const PROGRESS_FILE = './data/reading_progress.json';

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

    const wordsToShow = words.slice(0, 25);

    console.log(chalk.blue('  Obteniendo traducciones...'));
    const translations = await getBatchTranslations(wordsToShow);
    const transMap = new Map(translations.map(t => [t.word.toLowerCase(), t.translation]));

    const { selectedWords } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedWords',
        message: `Palabras nuevas (${words.length}):`,
        choices: wordsToShow.map(w => ({
            name: `${w} ${chalk.dim('→')} ${transMap.get(w.toLowerCase()) || chalk.red('?')}`,
            value: w,
            checked: true
        })),
        loop: false,
        pageSize: 15,
    }]);

    if (selectedWords.length === 0) {
        console.log(chalk.dim('  Ninguna palabra guardada.\n'));
        return;
    }

    let saved = 0;
    for (const word of selectedWords) {
        const translation = transMap.get(word.toLowerCase());
        if (translation) {
            const context = extractContextSentence(pageText, word);
            await saveWord({ word, translation, context });
            saved++;
        }
    }
    if (saved > 0) {
        console.log(chalk.green(`\n✔ ${saved} palabras guardadas con contexto.\n`));
        addXP(saved * 10);
    }
}

async function extractPageVocabAI(pageText: string): Promise<void> {
    console.log(chalk.blue('\nLa IA está seleccionando las palabras más útiles...'));
    const aiWords = await getPodcastVocab(pageText.substring(0, 3000));

    if (aiWords.length === 0) {
        console.log(chalk.red('No se pudieron extraer palabras con IA.\n'));
        return;
    }

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

    let saved = 0;
    for (const index of selectedIndices) {
        const { word, translation } = aiWords[index];
        const context = extractContextSentence(pageText, word);
        await saveWord({ word, translation, context });
        saved++;
    }
    console.log(chalk.green(`\n✔ ${saved} palabras guardadas.\n`));
    if (saved > 0) addXP(saved * 10);
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
        const pages = article.pages.map((text, i) => ({
            text,
            num: i + 1,
        }));
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
            lastSentenceRead: 0,
            totalSentences: 0, // se actualiza al abrir
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

        // Usar la última oración leída como punto de partida
        const startSentence = book.lastSentenceRead || 0;
        await displayReader(title, pages, startSentence, true);
    } catch (error: any) {
        console.error(chalk.red(`\nError al abrir el libro: ${error.message}`));
    }
}

/**
 * displayReader: convierte páginas en oraciones y muestra el modo oración.
 */
async function displayReader(title: string, pages: any[], startIndex: number = 0, isBook: boolean = false) {
    // Combinar todo el texto de todas las páginas
    const allText = pages
        .map((p: any) => p.text)
        .join('\n\n')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const sentences = splitIntoSentences(allText);

    if (sentences.length === 0) {
        console.log(chalk.red('No se encontraron oraciones en este texto.\n'));
        return;
    }

    // Actualizar el total de oraciones en el progreso (si es libro)
    if (isBook) {
        const progress = getProgress();
        if (progress.books[title]) {
            progress.books[title].totalSentences = sentences.length;
            saveProgress(progress);
        }
    }

    // Asegurar que startIndex esté en rango
    let currentSentence = Math.min(startIndex, sentences.length - 1);

    await sentenceReader(title, sentences, currentSentence, isBook);
}

/**
 * sentenceReader: loop principal navegando oración por oración.
 */
async function sentenceReader(
    title: string,
    sentences: string[],
    startIndex: number,
    isBook: boolean,
) {
    let current = startIndex;
    let shadowingMode = false;

    while (current < sentences.length) {
        const sentenceText = sentences[current];
        const uncommon = extractUncommonWordsFromText(sentenceText);

        console.clear();
        // ── Header ──
        console.log(chalk.blue.bold(`\n📖 ${title}`));
        console.log(chalk.gray(`Sentence ${current + 1} / ${sentences.length}`));
        console.log(chalk.cyan('═'.repeat(50)));

        // ── Texto resaltado ──
        console.log(`\n${highlightDifficultWords(sentenceText)}\n`);

        // ── Palabras nuevas ──
        if (uncommon.length > 0) {
            const displayWords = uncommon.slice(0, 8);
            console.log(chalk.yellow(`📝 ${uncommon.length} palabra${uncommon.length !== 1 ? 's' : ''} nueva${uncommon.length !== 1 ? 's' : ''}: `) +
                displayWords.join(', ') +
                (uncommon.length > 8 ? chalk.dim(`... (+${uncommon.length - 8} más)`) : ''));
        } else {
            console.log(chalk.green('\n✅ Todas las palabras son conocidas.\n'));
        }

        console.log(chalk.cyan('═'.repeat(50)));

        // ── Footer ──
        const audioIndicator = currentAudioProcess
            ? chalk.green('🔊')
            : chalk.dim('🔇');

        console.log(chalk.italic.gray('\n') +
            chalk.white('  ◀ Prev') + chalk.gray(' (←/p) ') +
            chalk.white('▶ Play') + chalk.gray(' (s) ') +
            chalk.white('→ Next') + chalk.gray(' (→/n) ') +
            chalk.white('★ Mark') + chalk.gray(' (m) ') +
            chalk.white('💬 Explain') + chalk.gray(' (e) ') +
            chalk.white('🌎 Translate') + chalk.gray(' (t)') + '\n' +
            chalk.white('  🎤 Shadow') + chalk.gray(' (w) ') +
            chalk.white('📚 Vocab') + chalk.gray(' (v) ') +
            chalk.white('AI Analyze') + chalk.gray(' (a) ') +
            chalk.white('✨ A2') + chalk.gray(' (z) ') +
            audioIndicator +
            chalk.gray('  [x]it\n'));

        const { raw } = await inquirer.prompt([{
            type: 'input',
            name: 'raw',
            message: '>',
            filter: (input: string) => input.trim().toLowerCase().slice(0, 1)
        }]);

        // ── Manejo de acciones ──
        if (raw === '→' || raw === 'l' || raw === 'n') {
            if (uncommon.length > 0) {
                const { saveVocab } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'saveVocab',
                    message: `📚 ¿Guardar ${uncommon.length} palabra${uncommon.length !== 1 ? 's' : ''} al vocabulario?`,
                    default: false,
                }]);
                if (saveVocab) {
                    await batchSavePageVocab(uncommon, sentenceText);
                }
            }
            if (current < sentences.length - 1) {
                current++;
                saveSentenceProgress(title, current, isBook);
                // Precargar audio de siguiente oración en background
                if (current + 1 < sentences.length) {
                    generateSentenceAudio(sentences[current]).catch(() => {});
                }
            }
        } else if (raw === '←' || raw === 'h' || raw === 'p') {
            if (current > 0) {
                current--;
                saveSentenceProgress(title, current, isBook);
            }
        } else if (raw === 's') {
            // Play / repeat audio
            await playCurrentSentenceAudio(sentenceText);
        } else if (raw === 'm') {
            await markSentenceDifficult(sentenceText, uncommon);
        } else if (raw === 'e') {
            await explainSentence(sentenceText);
        } else if (raw === 't') {
            await translateSentence(sentenceText);
        } else if (raw === 'w') {
            await shadowingSentence(sentenceText);
        } else if (raw === 'v') {
            await sentenceVocabMenu(sentenceText, uncommon);
        } else if (raw === 'a') {
            await analyzeSentence(sentenceText);
        } else if (raw === 'z') {
            await simplifySentence(sentenceText);
        } else if (raw === 'x' || raw === 'q') {
            stopAudio();
            break;
        }
        // Si el usuario presiona Enter sin escribir, siguiente oración
        else if (raw === '') {
            if (current < sentences.length - 1) {
                current++;
                saveSentenceProgress(title, current, isBook);
            }
        }
    }
}

// ─── Acciones de oración ─────────────────────────────────────────────

async function playCurrentSentenceAudio(text: string) {
    try {
        console.log(chalk.blue('  🔊 Generando audio...'));
        const path = await generateSentenceAudio(text);
        console.log(chalk.green('  ▶️  Reproduciendo...\n'));
        playAudioFile(path);
    } catch (e: any) {
        console.log(chalk.red(`  Error: ${e.message}`));
    }
}

async function markSentenceDifficult(text: string, uncommon: string[]) {
    // Si hay palabras nuevas, preguntar cuáles guardar
    if (uncommon.length > 0) {
        const wordsToShow = uncommon.slice(0, 15);
        const translations = await getBatchTranslations(wordsToShow);
        const transMap = new Map(translations.map(t => [t.word.toLowerCase(), t.translation]));

        const { selectedWords } = await inquirer.prompt([{
            type: 'checkbox',
            name: 'selectedWords',
            message: `★ Marcar como difícil — guardar palabras:`,
            choices: wordsToShow.map(w => ({
                name: `${w} ${chalk.dim('→')} ${transMap.get(w.toLowerCase()) || '?'}`,
                value: w,
                checked: true
            })),
            pageSize: 15
        }]);

        for (const word of selectedWords) {
            const translation = transMap.get(word.toLowerCase());
            if (translation) {
                await saveWord({ word, translation, context: text.substring(0, 120) });
            }
        }
        if (selectedWords.length > 0) {
            console.log(chalk.green(`\n✔ ${selectedWords.length} palabras guardadas.\n`));
            addXP(selectedWords.length * 10);
        }
    } else {
        console.log(chalk.yellow('  No hay palabras nuevas en esta oración.\n'));
    }
}

async function explainSentence(text: string) {
    console.log(chalk.blue('\n  Analizando con IA...'));
    const explanation = await getStylisticFeedback(
        `Explain this sentence in simple English and Spanish, highlighting any grammar or useful vocabulary: "${text}"`
    );
    console.log(chalk.magenta.bold('\n  --- Explicación ---'));
    console.log(`  ${explanation}`);
    console.log(chalk.magenta.bold('  -------------------\n'));
    await inquirer.prompt([{ type: 'input', name: 'wait', message: '  Presiona Enter para volver...' }]);
}

async function translateSentence(text: string) {
    console.log(chalk.blue('\n  Traduciendo...'));
    const translation = await translatePhrase(text);
    console.log(chalk.green(`\n  🌎 ${translation}\n`));
    await inquirer.prompt([{ type: 'input', name: 'wait', message: '  Presiona Enter para volver...' }]);
}

async function shadowingSentence(text: string) {
    try {
        console.log(chalk.blue('  🔊 Generando audio...'));
        const path = await generateSentenceAudio(text);
        console.log(chalk.green('  ▶️  Escucha...\n'));
        playAudioFile(path);

        // Esperar a que termine la reproducción
        await new Promise<void>((resolve) => {
            const check = setInterval(() => {
                if (!currentAudioProcess) {
                    clearInterval(check);
                    resolve();
                }
            }, 200);
        });

        console.log(chalk.yellow.bold('\n  🎤 Ahora repite en voz alta.'));
        console.log(chalk.italic.gray(`  "${text}"\n`));
        await inquirer.prompt([{
            type: 'input',
            name: 'wait',
            message: '  Presiona Enter cuando termines de repetir...'
        }]);
        console.log(chalk.green('  ✅ ¡Buen trabajo!\n'));
        addXP(15);
    } catch (e: any) {
        console.log(chalk.red(`  Error: ${e.message}`));
    }
}

async function sentenceVocabMenu(text: string, uncommon: string[]) {
    const { action } = await inquirer.prompt([{
        type: 'select',
        name: 'action',
        message: '📚 Vocabulario:',
        choices: [
            { name: `📝 Guardar palabras nuevas (${uncommon.length})`, value: 'save' },
            { name: '🤖 IA: Extraer vocabulario útil', value: 'ai' },
            { name: '🔍 Buscar palabra', value: 'lookup' },
            { name: '↩️ Volver', value: 'back' }
        ]
    }]);

    if (action === 'save') {
        await batchSavePageVocab(uncommon, text);
    } else if (action === 'ai') {
        await extractPageVocabAI(text);
    } else if (action === 'lookup') {
        const { word } = await inquirer.prompt([{
            type: 'input',
            name: 'word',
            message: '🔍 Palabra o frase:',
        }]);
        if (word.trim()) {
            await lookupWordInteraction(word.trim(), text);
        }
    }
}

async function analyzeSentence(text: string) {
    console.log(chalk.blue('\n  Analizando con IA...'));
    const analysis = await getPageAnalysis(text);
    console.log(chalk.green.bold('\n  --- Análisis ---'));
    console.log(`  ${analysis}`);
    console.log(chalk.green.bold('  -----------------\n'));
    await inquirer.prompt([{ type: 'input', name: 'wait', message: '  Presiona Enter para volver...' }]);
}

async function simplifySentence(text: string) {
    console.log(chalk.blue('\n  Simplificando a nivel A2...'));
    const simplified = await simplifyToA2(text);
    console.log(chalk.green.bold('\n  --- Simplificado A2 ---'));
    console.log(`  ${simplified}`);
    console.log(chalk.green.bold('  -----------------------\n'));
    await inquirer.prompt([{ type: 'input', name: 'wait', message: '  Presiona Enter para volver...' }]);
}

async function lookupWordInteraction(word: string, context: string) {
    const cleanWord = word.trim();
    const sentenceContext = extractContextSentence(context, cleanWord);
    const isPhrase = cleanWord.split(/\s+/).length > 1;

    if (isPhrase) {
        const translation = await translatePhrase(cleanWord, sentenceContext);
        console.log(chalk.green(`\n  "${cleanWord}" → ${translation}`));
        if (sentenceContext) {
            console.log(chalk.dim(`  Contexto: "${sentenceContext}"`));
        }
        const singleWords = cleanWord.split(/\s+/).filter(w => w.length > 2);
        if (singleWords.length > 0) {
            console.log(chalk.dim('\n  Palabras individuales:'));
            const wordTranslations = await getBatchTranslations(singleWords);
            for (const wt of wordTranslations) {
                if (wt.translation) {
                    console.log(chalk.dim(`    ${wt.word} → ${wt.translation}`));
                }
            }
            const toSave = wordTranslations.filter(wt => wt.translation);
            if (toSave.length > 0) {
                const { savePhraseWords } = await inquirer.prompt([{
                    type: 'checkbox',
                    name: 'savePhraseWords',
                    message: '📚 ¿Guardar palabras al vocabulario?',
                    choices: toSave.map(wt => ({
                        name: `${wt.word} → ${wt.translation}`,
                        value: wt.word,
                        checked: false
                    })),
                    pageSize: 10
                }]);
                if (savePhraseWords.length > 0) {
                    for (const w of savePhraseWords) {
                        const wt = toSave.find(t => t.word === w);
                        if (wt) {
                            await saveWord({ word: wt.word, translation: wt.translation, context: extractContextSentence(context, w) });
                        }
                    }
                    console.log(chalk.green(`\n✔ ${savePhraseWords.length} palabras guardadas.\n`));
                    addXP(savePhraseWords.length * 10);
                }
            }
        }
    } else {
        const translations = await getBatchTranslations([cleanWord]);
        if (translations[0]?.translation) {
            const translation = translations[0].translation;
            console.log(chalk.green(`\n  ${cleanWord} → ${translation}`));
            if (sentenceContext) {
                console.log(chalk.dim(`  Contexto: "${sentenceContext}"`));
            }
            const { markAction } = await inquirer.prompt([{
                type: 'select',
                name: 'markAction',
                message: '¿Qué quieres hacer?',
                choices: [
                    { name: '✅ Marcar como conocida', value: 'mark' },
                    { name: '💾 Guardar en vocabulario', value: 'save' },
                    { name: '↩️ Volver', value: 'back' }
                ]
            }]);
            if (markAction === 'mark') {
                await markWordAsKnown(cleanWord, translation, sentenceContext);
            } else if (markAction === 'save') {
                await saveWord({ word: cleanWord, translation, context: sentenceContext });
                addXP(10);
            }
        } else {
            console.log(chalk.yellow(`\n  "${cleanWord}" no reconocida.`));
            const { markAction } = await inquirer.prompt([{
                type: 'select',
                name: 'markAction',
                message: '¿Qué quieres hacer?',
                choices: [
                    { name: '✅ Marcar como conocida', value: 'mark' },
                    { name: '↩️ Volver', value: 'back' }
                ]
            }]);
            if (markAction === 'mark') {
                await markWordAsKnown(cleanWord, cleanWord, sentenceContext);
            }
        }
    }
}

// ─── Utilidades ──────────────────────────────────────────────────────

function saveSentenceProgress(title: string, sentenceIndex: number, isBook: boolean) {
    if (!isBook) return;
    const progress = getProgress();
    if (progress.books[title]) {
        progress.books[title].lastSentenceRead = sentenceIndex;
        saveProgress(progress);
    }
    addXP(5);
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
