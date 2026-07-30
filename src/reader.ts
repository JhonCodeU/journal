import inquirer from 'inquirer';
import chalk from 'chalk';
import axios from 'axios';
import { commonWords } from './vocabulary.js';
import { saveWord, getVocabulary, markWordAsKnown } from './vocabularyManager.js';
import { addXP } from './statsManager.js';
import { getStylisticFeedback, simplifyToA2, getPageAnalysis, getBatchTranslations, translatePhrase } from './aiManager.js';
import { generateSentenceAudio, playAudioFile, stopAudio, currentAudioProcess } from './ttsManager.js';

// ─── Dictionary API ────────────────────────────────────────────────

const DICT_API = 'https://freedictionaryapi.com/api/v1/entries/en';

interface DictEntry {
    partOfSpeech: string;
    definitions: string[];
    examples: string[];
    pronunciation?: string;
}

async function lookupDictionary(word: string): Promise<DictEntry | null> {
    try {
        const { data } = await axios.get(`${DICT_API}/${encodeURIComponent(word)}`);
        if (!data?.entries?.length) return null;
        const entry = data.entries[0];
        const pron = entry.pronunciations?.find((p: any) => p.type === 'ipa')?.text || '';
        const senses = entry.senses || [];
        const allDefs = senses.flatMap((s: any) => {
            const defs: string[] = [];
            if (s.definition) defs.push(s.definition);
            if (s.subsenses) s.subsenses.forEach((ss: any) => {
                if (ss.definition) defs.push(ss.definition);
            });
            return defs;
        });
        const allExamples = senses.flatMap((s: any) => s.examples || []);
        return {
            partOfSpeech: entry.partOfSpeech || '',
            definitions: allDefs.slice(0, 5),
            examples: allExamples.slice(0, 3),
            pronunciation: pron,
        };
    } catch {
        return null;
    }
}

async function showWordDetail(word: string, context?: string) {
    const dictInfo = await lookupDictionary(word);
    const [translation] = await getBatchTranslations([word]);

    console.clear();
    console.log(chalk.cyan('═'.repeat(50)));
    console.log(chalk.white.bold(`  ${word}`));
    if (dictInfo?.pronunciation) {
        console.log(chalk.gray(`  /${dictInfo.pronunciation}/`));
    }
    if (translation?.translation) {
        console.log(chalk.green(`  → ${translation.translation}`));
    }
    if (dictInfo?.partOfSpeech) {
        console.log(chalk.gray(`  (${dictInfo.partOfSpeech})`));
    }
    console.log(chalk.cyan('═'.repeat(50)));

    if (dictInfo?.definitions.length) {
        console.log(chalk.yellow.bold('\n  Definitions:'));
        dictInfo.definitions.forEach((def, i) => {
            console.log(`  ${i + 1}. ${def}`);
        });
    }

    if (dictInfo?.examples.length) {
        console.log(chalk.yellow.bold('\n  Examples:'));
        dictInfo.examples.forEach((ex, i) => {
            console.log(`  ${i + 1}. "${ex}"`);
        });
    }

    if (context) {
        console.log(chalk.dim(`\n  Context: "${context}"`));
    }

    console.log(chalk.cyan('═'.repeat(50)));

    const { action } = await inquirer.prompt([{
        type: 'select', name: 'action',
        message: '¿Qué haces?',
        choices: [
            { name: '💾 Guardar en vocabulario', value: 'save' },
            { name: '✅ Marcar como conocida', value: 'mark' },
            { name: '↩️ Volver', value: 'back' },
        ],
    }]);

    if (action === 'save') {
        await saveWord({ word, translation: translation?.translation || word, context });
        addXP(10);
        console.log(chalk.green(`  ✔ "${word}" guardada (+10 XP)`));
        await inquirer.prompt([{ type: 'input', name: 'wait', message: '  Presiona Enter...' }]);
    } else if (action === 'mark') {
        await markWordAsKnown(word, translation?.translation || '', context || '');
        console.log(chalk.green(`  ✔ "${word}" marcada como conocida`));
        await inquirer.prompt([{ type: 'input', name: 'wait', message: '  Presiona Enter...' }]);
    }
}

// ─── Helpers ───────────────────────────────────────────────────────

function extractUncommonWords(text: string): string[] {
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

function highlightText(text: string): string {
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

function extractContext(text: string, word: string): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const found = sentences.find(s =>
        new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s)
    );
    return found ? found.trim().substring(0, 120) : text.substring(0, 100);
}

const ABBREVIATIONS = new Set([
    'mr', 'mrs', 'ms', 'dr', 'st', 'sr', 'jr', 'etc', 'vs', 'inc', 'ltd',
    'dept', 'est', 'govt', 'ave', 'blvd', 'rd', 'jan', 'feb', 'mar', 'apr',
    'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]);

function isAbbreviation(text: string, pos: number): boolean {
    const before = text.slice(0, pos).match(/\b(\w+)\.\s*$/);
    if (!before) return false;
    const word = before[1].toLowerCase();
    return ABBREVIATIONS.has(word) || word.length === 1;
}

function splitSentences(text: string): string[] {
    const raw = text
        .replace(/\n{2,}/g, '\n\n')
        .split(/\n{2,}/)
        .flatMap(para => {
            const result: string[] = [];
            let start = 0;
            for (let i = 0; i < para.length; i++) {
                if ((para[i] === '.' || para[i] === '!' || para[i] === '?') &&
                    (i + 1 >= para.length || para[i + 1] === ' ' && (i + 2 < para.length && para[i + 2] === para[i + 2].toUpperCase() && para[i + 2] !== para[i + 2].toLowerCase()))) {
                    if (!isAbbreviation(para, i)) {
                        const sentence = para.slice(start, i + 1).trim();
                        if (sentence.length > 3) result.push(sentence);
                        start = i + 1;
                    }
                }
            }
            const last = para.slice(start).trim();
            if (last.length > 3) result.push(last);
            return result;
        })
        .filter(s => s.length > 5);

    // Group into chunks of ~3 sentences or 400+ characters
    const chunks: string[] = [];
    let buf: string[] = [];
    let bufLen = 0;
    for (const s of raw) {
        buf.push(s);
        bufLen += s.length;
        if (buf.length >= 3 || bufLen >= 400) {
            chunks.push(buf.join(' '));
            buf = [];
            bufLen = 0;
        }
    }
    if (buf.length > 0) chunks.push(buf.join(' '));
    return chunks;
}

// ─── Actions ───────────────────────────────────────────────────────

async function saveVocabPrompt(uncommon: string[], sentenceText: string) {
    if (uncommon.length === 0) return;
    const wordsToShow = uncommon.slice(0, 25);
    const translations = await getBatchTranslations(wordsToShow);
    const transMap = new Map(translations.map(t => [t.word.toLowerCase(), t.translation]));
    const { selectedWords } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedWords',
        message: `📝 Palabras nuevas (${uncommon.length}):`,
        choices: wordsToShow.map(w => ({
            name: `${w} ${chalk.dim('→')} ${transMap.get(w.toLowerCase()) || chalk.red('?')}`,
            value: w,
            checked: true,
        })),
        loop: false,
        pageSize: 15,
    }]);
    let saved = 0;
    for (const word of selectedWords) {
        const translation = transMap.get(word.toLowerCase());
        if (translation) {
            await saveWord({ word, translation, context: sentenceText.substring(0, 120) });
            saved++;
        }
    }
    if (saved > 0) {
        addXP(saved * 10);
        console.log(chalk.green(`  ✔ ${saved} palabra${saved > 1 ? 's' : ''} guardada${saved > 1 ? 's' : ''} (+${saved * 10} XP)`));
    }
}

async function playAudio(text: string): Promise<string> {
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

async function markDifficult(text: string, uncommon: string[]): Promise<string> {
    if (uncommon.length === 0) return '✅ Todas las palabras son conocidas.';
    const wordsToShow = uncommon.slice(0, 15);
    const translations = await getBatchTranslations(wordsToShow);
    const transMap = new Map(translations.map(t => [t.word.toLowerCase(), t.translation]));
    const { selectedWords } = await inquirer.prompt([{
        type: 'checkbox', name: 'selectedWords',
        message: '★ Guardar palabras:',
        choices: wordsToShow.map(w => ({
            name: `${w} ${chalk.dim('→')} ${transMap.get(w.toLowerCase()) || '?'}`,
            value: w, checked: true,
        })),
        pageSize: 15,
    }]);
    for (const word of selectedWords) {
        const translation = transMap.get(word.toLowerCase());
        if (translation) await saveWord({ word, translation, context: text.substring(0, 120) });
    }
    if (selectedWords.length > 0) {
        addXP(selectedWords.length * 10);
        return `✔ ${selectedWords.length} palabras guardadas.`;
    }
    return '⚠️  Ninguna palabra seleccionada.';
}

async function explainSentence(text: string) {
    console.log(chalk.blue('\n  Analizando con IA...'));
    const expl = await getStylisticFeedback(
        `Explain this sentence in simple English and Spanish, highlighting any grammar or useful vocabulary: "${text}"`
    );
    console.log(chalk.magenta.bold('\n  --- Explicación ---'));
    console.log(`  ${expl}`);
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
                if (!currentAudioProcess) { clearInterval(check); resolve(); }
            }, 200);
        });
        console.log(chalk.yellow.bold('\n  🎤 Ahora repite en voz alta.'));
        console.log(chalk.italic.gray(`  "${text}"\n`));
        await inquirer.prompt([{ type: 'input', name: 'wait', message: '  Presiona Enter cuando termines...' }]);
        console.log(chalk.green('  ✅ ¡Buen trabajo!\n'));
        addXP(15);
    } catch (e: any) {
        console.log(chalk.red(`  Error: ${e.message}`));
    }
}

async function vocabMenu(text: string, uncommon: string[]) {
    const { action } = await inquirer.prompt([{
        type: 'select', name: 'action',
        message: '📚 Vocabulario:',
        choices: [
            { name: `📝 Guardar palabras nuevas (${uncommon.length})`, value: 'save' },
            { name: '🤖 IA: Extraer vocabulario útil', value: 'ai' },
            { name: '🔍 Buscar palabra', value: 'lookup' },
            { name: '↩️ Volver', value: 'back' },
        ],
    }]);
    if (action === 'save') await saveVocabPrompt(uncommon, text);
    else if (action === 'ai') {
        console.log(chalk.blue('\n  Analizando con IA...'));
        const vocab = await getPageAnalysis(text);
        console.log(chalk.green.bold('\n  --- Vocabulario ---'));
        console.log(`  ${vocab}`);
        console.log(chalk.green.bold('  -------------------\n'));
        await inquirer.prompt([{ type: 'input', name: 'wait', message: '  Presiona Enter para volver...' }]);
    } else if (action === 'lookup') {
        const { word } = await inquirer.prompt([{ type: 'input', name: 'word', message: '🔍 ' }]);
        if (word.trim()) {
            const clean = word.trim();
            const ctx = extractContext(text, clean);
            await showWordDetail(clean, ctx);
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

// ─── Interactive Reader ────────────────────────────────────────────

export async function translateTextQuick(): Promise<void> {
    console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║          🌎  Traductor Rápido               ║'));
    console.log(chalk.cyan('║   Enter vacío para volver al menú           ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════╝\n'));

    while (true) {
        const { text } = await inquirer.prompt([{
            type: 'input',
            name: 'text',
            message: '✏️  Texto a traducir:',
        }]);

        if (!text.trim()) break;

        console.log(chalk.blue('\n  Traduciendo...\n'));
        const translation = await translatePhrase(text);
        console.log(chalk.cyan('═'.repeat(50)));
        console.log(chalk.white.bold('  EN:'));
        console.log(chalk.gray(`  ${text}`));
        console.log(chalk.cyan('─'.repeat(30)));
        console.log(chalk.white.bold('  ES:'));
        console.log(chalk.green(`  ${translation}`));
        console.log(chalk.cyan('═'.repeat(50)));
        console.log(); // blank line for spacing
    }
}

export async function analyzeText(): Promise<void> {
    const { text } = await inquirer.prompt([{
        type: 'editor',
        name: 'text',
        message: 'Paste the text you want to analyze:',
    }]);

    const sentences = splitSentences(text);
    if (sentences.length === 0) {
        console.log(chalk.red('No se pudo dividir el texto en oraciones.'));
        return;
    }

    let current = 0;
    let statusMessage = '';

    while (current < sentences.length) {
        const sentenceText = sentences[current];
        const uncommon = extractUncommonWords(sentenceText);

        console.clear();
        console.log(chalk.blue.bold(`\n📖 Analyze a Text`));
        console.log(chalk.gray(`Sentence ${current + 1} / ${sentences.length}`));
        console.log(chalk.cyan('═'.repeat(50)));

        console.log(`\n${highlightText(sentenceText)}\n`);

        if (uncommon.length > 0) {
            const displayWords = uncommon.slice(0, 8);
            console.log(chalk.yellow(`📝 ${uncommon.length} palabra${uncommon.length !== 1 ? 's' : ''} nueva${uncommon.length !== 1 ? 's' : ''}: `) +
                displayWords.join(', ') +
                (uncommon.length > 8 ? chalk.dim(`... (+${uncommon.length - 8} más)`) : ''));
        } else {
            console.log(chalk.green('\n✅ Todas las palabras son conocidas.\n'));
        }

        console.log(chalk.cyan('═'.repeat(50)));

        const audioIndicator = currentAudioProcess ? chalk.green('🔊') : chalk.dim('🔇');
        if (statusMessage) console.log(chalk.italic(statusMessage));

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
            filter: (input: string) => input.trim().toLowerCase().slice(0, 1),
        }]);

        statusMessage = '';
        if (raw === '→' || raw === 'l' || raw === 'n') {
            if (current < sentences.length - 1) {
                current++;
                addXP(5);
            }
        } else if (raw === '←' || raw === 'h' || raw === 'p') {
            if (current > 0) current--;
        } else if (raw === 's') {
            statusMessage = await playAudio(sentenceText);
        } else if (raw === 'm') {
            statusMessage = await markDifficult(sentenceText, uncommon);
        } else if (raw === 'e') {
            await explainSentence(sentenceText);
        } else if (raw === 't') {
            await translateSentence(sentenceText);
        } else if (raw === 'w') {
            await shadowingSentence(sentenceText);
        } else if (raw === 'v') {
            await vocabMenu(sentenceText, uncommon);
        } else if (raw === 'a') {
            await analyzeSentence(sentenceText);
        } else if (raw === 'z') {
            await simplifySentence(sentenceText);
        } else if (raw === 'x' || raw === 'q') {
            stopAudio();
            break;
        } else if (raw === '') {
            if (current < sentences.length - 1) {
                current++;
                addXP(5);
            }
        }
    }
}
