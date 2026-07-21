import fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Book } from './book/types.js';
import { 
  createReader, 
  getCurrentBookId, 
  getBookProgress, 
  initBookProgress, 
  setCurrentBook, 
  saveSentenceProgress, 
  getAllBooks,
} from './book/index.js';
import { getStylisticFeedback, simplifyToA2, getPageAnalysis, getBatchTranslations, getPodcastVocab, translatePhrase } from './aiManager.js';
import { saveWord, getVocabulary, markWordAsKnown } from './vocabularyManager.js';
import { commonWords } from './vocabulary.js';
import { addXP } from './statsManager.js';
import { fetchArticle } from './webReader.js';
import { generateSentenceAudio, playAudioFile, stopAudio, currentAudioProcess } from './ttsManager.js';

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

// ─── Book Hub ──────────────────────────────────────────────────────

export async function openBookHub() {
    try {
        const choices = [
            { name: '📖 Continuar Leyendo', value: 'continue' },
            { name: '📂 Abrir EPUB', value: 'open_epub' },
            { name: '📕 Abrir PDF', value: 'open_pdf' },
            { name: '📚 Mi Biblioteca', value: 'library' },
            new inquirer.Separator(),
            { name: 'Volver', value: 'back' }
        ];

        const { action } = await inquirer.prompt([{
            type: 'select',
            name: 'action',
            message: '📚 Books:',
            choices
        }]);

        switch (action) {
            case 'continue': {
                const currentId = getCurrentBookId();
                if (!currentId) {
                    console.log(chalk.yellow('\nNo hay ningún libro abierto.\n'));
                    return openBookHub();
                }
                const found = getBookProgress(currentId);
                if (!found) {
                    console.log(chalk.yellow('\nEl libro ya no está disponible.\n'));
                    return openBookHub();
                }
                await readBook(currentId);
                break;
            }
            case 'open_epub':
                await openFile('epub');
                break;
            case 'open_pdf':
                await openFile('pdf');
                break;
            case 'library':
                await showLibrary();
                break;
            case 'back':
                return;
        }
    } catch (error: any) {
        console.error(chalk.red(`\nError: ${error.message}`));
    }
}

async function openFile(format: 'epub' | 'pdf') {
    const { filePath } = await inquirer.prompt([{
        type: 'input',
        name: 'filePath',
        message: `Introduce la ruta al archivo .${format}:`,
        validate: (input: string) => {
            if (!fs.existsSync(input)) return 'El archivo no existe.';
            if (!input.toLowerCase().endsWith(`.${format}`)) return `Debe ser un archivo .${format}`;
            return true;
        }
    }]);

    const reader = createReader(filePath);
    const meta = reader.getMetadata();
    console.log(chalk.blue(`\nCargando "${meta.title}"...`));
    const book = await reader.load();
    
    initBookProgress(book.id, book.totalChapters, book.totalSentences, filePath);
    setCurrentBook(book.id);
    
    console.log(chalk.green(`\n¡"${book.title}" cargado! (${book.totalChapters} capítulos, ${book.totalSentences} oraciones)\n`));
    await sentenceReader(book, 0, 0);
}

async function readBook(bookId: string) {
    const progress = getBookProgress(bookId);
    if (!progress) {
        console.log(chalk.red('\nNo se encontró el progreso del libro.\n'));
        return;
    }
    if (!fs.existsSync(progress.path)) {
        console.log(chalk.red(`\nError: No se encontró el archivo en ${progress.path}\n`));
        return;
    }

    console.log(chalk.blue(`\nCargando libro...`));
    const reader = createReader(progress.path);
    const book = await reader.load();
    
    // Resume from saved position
    let startSentence = progress.lastSentenceRead;
    if (startSentence >= book.totalSentences) startSentence = 0;
    const startChapter = book.sentences[startSentence]?.chapterIndex || 0;

    await sentenceReader(book, startSentence, startChapter);
}

// ─── Sentence Reader Loop ──────────────────────────────────────────

async function sentenceReader(book: Book, startSentence: number, startChapter: number) {
    let current = startSentence;
    let statusMessage = '';

    while (current < book.totalSentences) {
        const sentence = book.sentences[current];
        const chapter = book.chapters[sentence.chapterIndex];
        const sentenceText = sentence.text;
        const uncommon = extractUncommonWordsFromText(sentenceText);

        console.clear();
        // ── Header with chapter info ──
        console.log(chalk.blue.bold(`\n📖 ${book.title}`));
        console.log(chalk.gray(`${chapter.title} — Sentence ${current + 1} / ${book.totalSentences}`));
        console.log(chalk.cyan('═'.repeat(50)));

        // ── Highlighted text ──
        console.log(`\n${highlightDifficultWords(sentenceText)}\n`);

        // ── New words ──
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
        const audioIndicator = currentAudioProcess ? chalk.green('🔊') : chalk.dim('🔇');

        if (statusMessage) {
            console.log(chalk.italic(statusMessage));
        }

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

        // ── Actions ──
        statusMessage = '';
        if (raw === '→' || raw === 'l' || raw === 'n') {
            await maybeSaveVocab(uncommon, sentenceText);
            if (current < book.totalSentences - 1) {
                current++;
                saveSentenceProgress(book.id, current, sentence.chapterIndex);
                addXP(5);
            }
        } else if (raw === '←' || raw === 'h' || raw === 'p') {
            if (current > 0) {
                current--;
                saveSentenceProgress(book.id, current, sentence.chapterIndex);
            }
        } else if (raw === 's') {
            statusMessage = await playCurrentSentenceAudio(sentenceText);
        } else if (raw === 'm') {
            statusMessage = await markSentenceDifficult(sentenceText, uncommon);
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
        } else if (raw === '') {
            if (current < book.totalSentences - 1) {
                current++;
                saveSentenceProgress(book.id, current, sentence.chapterIndex);
                addXP(5);
            }
        }
    }
}

// ─── Acciones ──────────────────────────────────────────────────────

async function maybeSaveVocab(uncommon: string[], text: string) {
    if (uncommon.length === 0) return;
    const { saveVocab } = await inquirer.prompt([{
        type: 'confirm',
        name: 'saveVocab',
        message: `📚 ¿Guardar ${uncommon.length} palabra${uncommon.length !== 1 ? 's' : ''} al vocabulario?`,
        default: false,
    }]);
    if (saveVocab) {
        await batchSavePageVocab(uncommon, text);
    }
}

async function playCurrentSentenceAudio(text: string): Promise<string> {
    try {
        console.log(chalk.blue('  🔊 Generando audio...'));
        const path = await generateSentenceAudio(text);
        console.log(chalk.green('  ▶️  Reproduciendo...\n'));
        playAudioFile(path);
        return '';
    } catch (e: any) {
        return `⚠️  Error: ${e.message}`;
    }
}

async function markSentenceDifficult(text: string, uncommon: string[]): Promise<string> {
    if (uncommon.length === 0) {
        return '✅ Todas las palabras ya son conocidas.';
    }
    const wordsToShow = uncommon.slice(0, 15);
    const translations = await getBatchTranslations(wordsToShow);
    const transMap = new Map(translations.map(t => [t.word.toLowerCase(), t.translation]));
    const { selectedWords } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedWords',
        message: `★ Guardar palabras:`,
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
        addXP(selectedWords.length * 10);
        return `✔ ${selectedWords.length} palabras guardadas.`;
    }
    return '⚠️  Ninguna palabra seleccionada.';
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
        await inquirer.prompt([{ type: 'input', name: 'wait', message: '  Presiona Enter cuando termines de repetir...' }]);
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
    if (action === 'save') await batchSavePageVocab(uncommon, text);
    else if (action === 'ai') await extractPageVocabAI(text);
    else if (action === 'lookup') {
        const { word } = await inquirer.prompt([{ type: 'input', name: 'word', message: '🔍 ' }]);
        if (word.trim()) await lookupWordInteraction(word.trim(), text);
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
        const singleWords = cleanWord.split(/\s+/).filter((w: any) => w.length > 2);
        if (singleWords.length > 0) {
            const wordTranslations = await getBatchTranslations(singleWords);
            for (const wt of wordTranslations) {
                if (wt.translation) console.log(chalk.dim(`    ${wt.word} → ${wt.translation}`));
            }
        }
    } else {
        const translations = await getBatchTranslations([cleanWord]);
        if (translations[0]?.translation) {
            const translation = translations[0].translation;
            console.log(chalk.green(`\n  ${cleanWord} → ${translation}`));
            const { markAction } = await inquirer.prompt([{
                type: 'select', name: 'markAction', message: '¿Qué haces?',
                choices: [
                    { name: '✅ Marcar como conocida', value: 'mark' },
                    { name: '💾 Guardar en vocabulario', value: 'save' },
                    { name: '↩️ Volver', value: 'back' }
                ]
            }]);
            if (markAction === 'mark') await markWordAsKnown(cleanWord, translation, sentenceContext);
            else if (markAction === 'save') { await saveWord({ word: cleanWord, translation, context: sentenceContext }); addXP(10); }
        } else {
            const { markAction } = await inquirer.prompt([{
                type: 'select', name: 'markAction', message: '¿Qué haces?',
                choices: [
                    { name: '✅ Marcar como conocida', value: 'mark' },
                    { name: '↩️ Volver', value: 'back' }
                ]
            }]);
            if (markAction === 'mark') await markWordAsKnown(cleanWord, cleanWord, sentenceContext);
        }
    }
}

// ─── Library ───────────────────────────────────────────────────────

async function showLibrary() {
    const books = getAllBooks();
    const entries = Object.entries(books);
    if (entries.length === 0) {
        console.log(chalk.yellow('\nTu biblioteca está vacía.\n'));
        return;
    }
    const { selectedId } = await inquirer.prompt([{
        type: 'select',
        name: 'selectedId',
        message: 'Selecciona un libro:',
        choices: [
            ...entries.map(([id, info]) => ({
                name: `${id} ${chalk.dim(`(${info.lastSentenceRead}/${info.totalSentences} oraciones)`)}`,
                value: id
            })),
            { name: 'Volver', value: 'back' }
        ]
    }]);
    if (selectedId === 'back') return;
    setCurrentBook(selectedId);
    await readBook(selectedId);
}

/**
 * Web Reader: read online articles sentence-by-sentence.
 */
export async function openWebReader() {
    const { url } = await inquirer.prompt([{
        type: 'input',
        name: 'url',
        message: 'Introduce la URL del artículo:',
        validate: (input) => input.startsWith('http') ? true : 'Por favor, introduce una URL válida.'
    }]);

    const article = await fetchArticle(url);
    if (!article) return;

    // Build a Book-like structure from the web article
    const sentences = article.pages.flatMap(page =>
        page.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 5)
    );

    const book: Book = {
        id: url,
        title: article.title,
        author: '',
        language: 'en',
        format: 'pdf',
        sourcePath: url,
        totalChapters: 1,
        totalSentences: sentences.length,
        chapters: [{
            id: 'chapter-1',
            title: article.title,
            order: 1,
            paragraphs: article.pages.map(text => ({ text, sentences: [text] })),
            sentenceCount: sentences.length,
            startSentenceIndex: 0,
        }],
        sentences: sentences.map((text, i) => ({
            text,
            chapterIndex: 0,
            globalIndex: i,
        })),
        sentenceToChapter: new Array(sentences.length).fill(0),
    };

    await sentenceReader(book, 0, 0);
}
