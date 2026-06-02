import 'dotenv/config';
import inquirer from 'inquirer';
import chalk from 'chalk';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { saveWord } from './vocabularyManager.js';
import { getSongContext, getBilingualLyrics } from './aiManager.js';

const GENIUS_API_BASE_URL = 'https://api.genius.com';
const GENIUS_ACCESS_TOKEN = process.env.GENIUS_API_TOKEN;

// ─── Tipos ────────────────────────────────────────────────────────────────────

type InteractionMode = 'word-by-word' | 'full-line' | 'multiple-choice';

interface ProcessedLine {
  originalLine: string;
  parts: LinePart[];          // Alternancia de texto fijo y blanks
}

interface LinePart {
  type: 'text' | 'blank';
  content: string;            // Texto visible o palabra original
  index: number;              // Índice global del blank (solo si type === 'blank')
}

interface ProcessedSection {
  title: string;
  lines: ProcessedLine[];
}

// ─── API & Scraping ───────────────────────────────────────────────────────────

async function searchGenius(query: string): Promise<any[]> {
  try {
    const response = await axios.get(`${GENIUS_API_BASE_URL}/search`, {
      headers: { Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}` },
      params: { q: query },
    });
    return response.data.response.hits;
  } catch (error: any) {
    console.error(chalk.red('Error buscando en Genius:'), error.message);
    return [];
  }
}

async function getLyricsFromGeniusPage(url: string): Promise<{ title: string; lines: string[] }[] | null> {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Genius uses [data-lyrics-container="true"] for modern pages, and .lyrics for older ones.
    const lyricsContainers = $('[data-lyrics-container="true"], .lyrics');
    if (lyricsContainers.length === 0) return null;

    let fullText = '';
    lyricsContainers.each((_, elem) => {
      const container = $(elem);
      
      // Remove known noise elements before extracting text
      container.find('button, script, style, noscript, .LyricsFooter__Container-sc-1as9epp-0').remove();
      
      // Replace <br> with newlines to preserve line breaks
      container.find('br').replaceWith('\n');
      
      // Extract text and add spacing between containers
      fullText += container.text() + '\n\n';
    });

    const rawLines = fullText.split('\n');
    
    // Filter and clean lines
    const cleanLines = rawLines
      .map(l => l.trim())
      .filter(l => {
        if (!l) return false;
        
        // Filter out obvious metadata/UI noise
        if (l.includes('Contributors') || l.includes('Translations')) return false;
        if (l.includes('Lyrics') && (l.includes('“') || l.includes('"'))) return false; // Likely song title/description header
        if (l.match(/\(Simplified Chinese\)|ไทย|Русский|日本語|한국어|Deutsch|Français|Italiano|Português|Español/)) return false; // Language list
        if (l.match(/^\d+\s*\[\d+\]/)) return false; // Annotation counts like "213 [68]"
        if (l.includes('Read More') || l.includes('Embed') || l.includes('Share')) return false;
        
        return true;
      })
      .map(l => {
        // Remove annotation numbers like [1], [23], etc.
        return l.replace(/\[\d+\]/g, '').trim();
      })
      .filter(l => l !== '');

    if (cleanLines.length === 0) return null;

    const sections: { title: string; lines: string[] }[] = [];
    let currentSection: { title: string; lines: string[] } = { title: 'Intro', lines: [] };

    for (const line of cleanLines) {
      // Look for section headers like [Chorus], [Verse 1], etc.
      const match = line.match(/^\[(.+)\]$/);
      if (match) {
        if (currentSection.lines.length > 0) sections.push(currentSection);
        currentSection = { title: match[1], lines: [] };
      } else {
        currentSection.lines.push(line);
      }
    }
    if (currentSection.lines.length > 0) sections.push(currentSection);

    return sections;
  } catch (error: any) {
    console.error(chalk.red('Error scrapeando Genius:'), error.message);
    return null;
  }
}

// ─── Procesamiento de Blanks ──────────────────────────────────────────────────

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, '');
}

function createFillInTheBlanks(
  sections: { title: string; lines: string[] }[],
  difficulty: number
): { processedSections: ProcessedSection[]; totalBlanks: number } {
  let blankIndex = 0;
  const processedSections: ProcessedSection[] = [];

  for (const section of sections) {
    const processedLines: ProcessedLine[] = [];

    for (const line of section.lines) {
      const tokens = line.split(/(\s+)/);
      const fillableIndices: number[] = [];

      tokens.forEach((token, i) => {
        if (token.trim() !== '' && /[a-zA-Z]/.test(token)) {
          fillableIndices.push(i);
        }
      });

      const targetCount = Math.max(1, Math.ceil(fillableIndices.length * difficulty));
      const indicesToBlank = new Set<number>();

      const shuffled = [...fillableIndices].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(targetCount, shuffled.length); i++) {
        indicesToBlank.add(shuffled[i]);
      }

      const parts: LinePart[] = [];
      let textBuffer = '';

      tokens.forEach((token, i) => {
        if (indicesToBlank.has(i)) {
          if (textBuffer) {
            parts.push({ type: 'text', content: textBuffer, index: -1 });
            textBuffer = '';
          }
          const cleanWord = token.replace(/[^a-zA-Z0-9'']/g, '');
          parts.push({ type: 'blank', content: cleanWord, index: blankIndex++ });
        } else {
          textBuffer += token;
        }
      });

      if (textBuffer) parts.push({ type: 'text', content: textBuffer, index: -1 });

      processedLines.push({ originalLine: line, parts });
    }

    processedSections.push({ title: section.title, lines: processedLines });
  }

  return { processedSections, totalBlanks: blankIndex };
}

function getAllWordsFromSections(sections: { title: string; lines: string[] }[]): string[] {
  const words = new Set<string>();
  for (const section of sections) {
    for (const line of section.lines) {
      const tokens = line.split(/[\s,.;:!?()"]+/);
      for (const token of tokens) {
        const clean = token.replace(/[^a-zA-Z0-9']/g, '');
        if (clean && clean.length > 1) {
          words.add(clean);
        }
      }
    }
  }
  return Array.from(words);
}

// ─── Renderizado de líneas ────────────────────────────────────────────────────

function renderLineWithBlanks(parts: LinePart[]): string {
  return parts.map(p => {
    if (p.type === 'text') return p.content;
    return chalk.bgBlackBright.yellow(` [${p.content.length}] `);
  }).join('');
}

function renderLineWithAnswers(parts: LinePart[], answers: Map<number, string>): string {
  return parts.map(p => {
    if (p.type === 'text') return p.content;
    const answer = answers.get(p.index);
    const correct = normalizeWord(answer ?? '') === normalizeWord(p.content);
    if (!answer) return chalk.red(`[${p.content}]`);
    return correct ? chalk.green(answer) : chalk.red(answer) + chalk.dim(`(${p.content})`);
  }).join('');
}

// ─── Lógica de juego por modo ─────────────────────────────────────────────────

async function playWordByWord(
  parts: LinePart[],
  missedWords: Set<string>,
  answers: Map<number, string>
): Promise<number> {
  const blanks = parts.filter(p => p.type === 'blank');
  let correct = 0;

  console.log(`\n  ${renderLineWithBlanks(parts)}`);

  for (const blank of blanks) {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: chalk.dim(`  Blank [${blank.index + 1}] (${blank.content.length} letras) — escribe "?" para pista, "." para saltar:`),
      prefix: '  →',
    }]);

    const trimmed = input.trim();

    if (trimmed === '?') {
      console.log(chalk.yellow(`  💡 Pista: la palabra empieza con "${blank.content[0].toUpperCase()}"`));
      const { retry } = await inquirer.prompt([{
        type: 'input',
        name: 'retry',
        message: chalk.dim(`  Intenta de nuevo:`),
        prefix: '  →',
      }]);
      const retryNorm = normalizeWord(retry.trim());
      const expected = normalizeWord(blank.content);
      answers.set(blank.index, retry.trim() || '[vacío]');
      if (retryNorm === expected) {
        console.log(chalk.green(`  ✔ ¡Correcto!`));
        correct++;
      } else {
        console.log(chalk.red(`  ✖ Era: ${chalk.yellow(blank.content)}`));
        missedWords.add(blank.content);
      }
    } else if (trimmed === '.') {
      console.log(chalk.dim(`  ⏭  Saltado — era: ${chalk.yellow(blank.content)}`));
      answers.set(blank.index, '[saltado]');
      missedWords.add(blank.content);
    } else {
      const userNorm = normalizeWord(trimmed);
      const expected = normalizeWord(blank.content);
      answers.set(blank.index, trimmed || '[vacío]');
      if (userNorm === expected) {
        console.log(chalk.green(`  ✔ ¡Correcto!`));
        correct++;
      } else {
        console.log(chalk.red(`  ✖ Era: ${chalk.yellow(blank.content)}`));
        missedWords.add(blank.content);
      }
    }
  }

  return correct;
}

async function playMultipleChoice(
  parts: LinePart[],
  missedWords: Set<string>,
  answers: Map<number, string>,
  allWords: string[]
): Promise<number> {
  const blanks = parts.filter(p => p.type === 'blank');
  let correct = 0;

  console.log(`\n  ${renderLineWithBlanks(parts)}`);

  for (const blank of blanks) {
    const expected = normalizeWord(blank.content);
    
    let distractors = allWords
      .filter(w => normalizeWord(w) !== expected)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    
    const common = ['love', 'time', 'life', 'heart', 'baby', 'yeah', 'night', 'world'];
    while (distractors.length < 2) {
      const extra = common[Math.floor(Math.random() * common.length)];
      if (normalizeWord(extra) !== expected && !distractors.includes(extra)) {
        distractors.push(extra);
      }
    }

    const choices = [blank.content, ...distractors]
      .sort(() => Math.random() - 0.5);

    const { selected } = await inquirer.prompt([{
      type: 'select',
      name: 'selected',
      message: chalk.dim(`  Blank [${blank.index + 1}]:`),
      choices: choices.map(c => ({ name: c, value: c })),
      prefix: '  →',
    }]);

    answers.set(blank.index, selected);
    if (normalizeWord(selected) === expected) {
      console.log(chalk.green(`  ✔ ¡Correcto!`));
      correct++;
    } else {
      console.log(chalk.red(`  ✖ Era: ${chalk.yellow(blank.content)}`));
      missedWords.add(blank.content);
    }
  }

  return correct;
}

async function playFullLine(
  parts: LinePart[],
  missedWords: Set<string>,
  answers: Map<number, string>
): Promise<number> {
  const blanks = parts.filter(p => p.type === 'blank');
  if (blanks.length === 0) return 0;

  console.log(`\n  ${renderLineWithBlanks(parts)}`);
  console.log(chalk.dim(`  (${blanks.length} ${blanks.length === 1 ? 'palabra' : 'palabras'} faltante${blanks.length !== 1 ? 's' : ''} — separadas por espacios — "?" pista — "." saltar)`));

  const { input } = await inquirer.prompt([{
    type: 'input',
    name: 'input',
    message: '',
    prefix: '  →',
  }]);

  const trimmed = input.trim();
  let correct = 0;

  if (trimmed === '.') {
    for (const blank of blanks) {
      console.log(chalk.dim(`  ⏭  Saltado — era: ${chalk.yellow(blank.content)}`));
      answers.set(blank.index, '[saltado]');
      missedWords.add(blank.content);
    }
    return 0;
  }

  if (trimmed === '?') {
    const hints = blanks.map(b => `"${b.content[0].toUpperCase()}..." (${b.content.length} letras)`).join(', ');
    console.log(chalk.yellow(`  💡 Pistas: ${hints}`));
    const { retry } = await inquirer.prompt([{
      type: 'input',
      name: 'retry',
      message: chalk.dim(`  Intenta de nuevo:`),
      prefix: '  →',
    }]);
    return scoreFullLine(blanks, retry.trim(), missedWords, answers);
  }

  return scoreFullLine(blanks, trimmed, missedWords, answers);
}

function scoreFullLine(
  blanks: LinePart[],
  input: string,
  missedWords: Set<string>,
  answers: Map<number, string>
): number {
  const userWords = input.split(/\s+/).filter(w => w !== '');
  let correct = 0;

  for (let i = 0; i < blanks.length; i++) {
    const blank = blanks[i];
    const userWord = userWords[i] ?? '[vacío]';
    const userNorm = normalizeWord(userWord);
    const expected = normalizeWord(blank.content);

    answers.set(blank.index, userWord);

    if (userNorm === expected) {
      console.log(chalk.green(`  ✔ "${blank.content}"`));
      correct++;
    } else {
      console.log(chalk.red(`  ✖ Esperaba: ${chalk.yellow(blank.content)} — escribiste: ${chalk.red(userWord)}`));
      missedWords.add(blank.content);
    }
  }

  return correct;
}

// ─── Sesión principal ─────────────────────────────────────────────────────────

export async function interactiveMusicSession(): Promise<void> {
  console.log(chalk.cyan.bold('\n🎵 Bienvenido a la sesión interactiva de música\n'));

  const { query } = await inquirer.prompt([{
    type: 'input',
    name: 'query',
    message: 'Artista y canción (ej: "Taylor Swift Opalite"):',
  }]);

  console.log(chalk.blue(`\nBuscando "${query}" en Genius...`));
  const hits = await searchGenius(query);

  if (hits.length === 0) {
    console.log(chalk.red('No se encontraron canciones.\n'));
    return;
  }

  const choices = [
    ...hits.map((hit, i) => ({
      name: `${i + 1}. ${hit.result.artist_names} — ${hit.result.title}`,
      value: { url: hit.result.url, title: hit.result.title, artist: hit.result.artist_names },
    })),
    new inquirer.Separator(),
    { name: 'Volver al menú', value: 'back' },
  ];

  const { selectedSong } = await inquirer.prompt([{
    type: 'select',
    name: 'selectedSong',
    message: 'Selecciona la canción:',
    choices,
    loop: false,
  }]);

  if (selectedSong === 'back') return;

  const { url: selectedSongUrl, title, artist } = selectedSong;

  console.log(chalk.blue('\nObteniendo letra...'));
  const lyricSections = await getLyricsFromGeniusPage(selectedSongUrl);

  if (!lyricSections || lyricSections.length === 0) {
    console.log(chalk.red('No se pudo obtener la letra.\n'));
    return;
  }

  // PRE-SESIÓN: Análisis y Letras Bilingües
  const { preSessionOption } = await inquirer.prompt([{
    type: 'select',
    name: 'preSessionOption',
    message: '¿Quieres prepararte antes de jugar?',
    choices: [
      { name: 'Ver análisis (historia y expresiones)', value: 'analysis' },
      { name: 'Ver letra bilingüe (English/Spanish)', value: 'bilingual' },
      { name: 'Ambos', value: 'both' },
      { name: 'Nada, empezar a jugar', value: 'none' },
    ],
  }]);

  if (preSessionOption === 'analysis' || preSessionOption === 'both') {
    console.log(chalk.blue('\nGenerando análisis con IA...'));
    const allLyricsText = lyricSections.map(s => s.lines.join('\n')).join('\n');
    const analysis = await getSongContext(title, artist, allLyricsText);
    console.log(chalk.yellow('\n─── ANÁLISIS DE LA CANCIÓN ───'));
    console.log(analysis);
    console.log(chalk.yellow('─────────────────────────────\n'));
  }

  if (preSessionOption === 'bilingual' || preSessionOption === 'both') {
    console.log(chalk.blue('\n📖 Letra original completa (English):'));
    lyricSections.forEach(s => {
      console.log(chalk.magenta(`\n[${s.title}]`));
      s.lines.forEach(l => console.log(`  ${l}`));
    });

    console.log(chalk.yellow('\n✨ Generando versión bilingüe para estudio (sección por sección)...'));
    console.log(chalk.cyan('\n─── ESTUDIO BILINGÜE ───'));
    
    for (const section of lyricSections) {
      console.log(chalk.magenta.bold(`\n[${section.title}]`));
      const sectionText = section.lines.join('\n');
      
      const bilingual = await getBilingualLyrics(sectionText);
      
      const lines = bilingual.split('\n');
      for (const line of lines) {
        if (line.startsWith('ES: ')) {
          console.log(chalk.italic.cyan(`  ${line}`));
        } else if (line.trim() && !line.startsWith('[')) {
          console.log(chalk.white(`  ${line}`));
        }
      }
    }
    console.log(chalk.cyan('\n────────────────────────\n'));
  }

  if (preSessionOption !== 'none') {
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Presiona Enter para continuar...' }]);
  }

  const { mode } = await inquirer.prompt([{
    type: 'select',
    name: 'mode',
    message: '¿Cómo quieres jugar?',
    choices: [
      { name: 'Opción múltiple    (LyricsTraining style - elegir entre 3)', value: 'multiple-choice' },
      { name: 'Palabra por palabra  (un prompt por cada blank)', value: 'word-by-word' },
      { name: 'Línea completa       (todas las palabras del renglón juntas)', value: 'full-line' },
    ],
  }]);

  const { difficulty } = await inquirer.prompt([{
    type: 'select',
    name: 'difficulty',
    message: 'Dificultad:',
    choices: [
      { name: 'Fácil   (~15% de palabras)', value: 0.15 },
      { name: 'Normal  (~30% de palabras)', value: 0.30 },
      { name: 'Difícil (~50% de palabras)', value: 0.50 },
    ],
  }]);

  console.log(chalk.green('\n¡Prepárate!'));
  const youtubeLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  console.log(`🎧 Escúchala aquí: ${chalk.underline.blue(youtubeLink)}\n`);

  const { processedSections, totalBlanks } = createFillInTheBlanks(lyricSections, difficulty);
  const allWordsInSong = getAllWordsFromSections(lyricSections);

  const missedWords = new Set<string>();
  const answers = new Map<number, string>();
  let correctCount = 0;
  let sectionsDone = 0;
  const totalSections = processedSections.length;

  for (const section of processedSections) {
    sectionsDone++;
    const progress = chalk.dim(`[${sectionsDone}/${totalSections}]`);
    console.log(chalk.magenta.bold(`\n${progress} ── ${section.title} ──`));

    for (const lineData of section.lines) {
      const blanks = lineData.parts.filter(p => p.type === 'blank');
      if (blanks.length === 0) {
        console.log(`\n  ${lineData.originalLine}`);
        continue;
      }

      let lineCorrect: number;
      if (mode === 'multiple-choice') {
        lineCorrect = await playMultipleChoice(lineData.parts, missedWords, answers, allWordsInSong);
      } else if (mode === 'word-by-word') {
        lineCorrect = await playWordByWord(lineData.parts, missedWords, answers);
      } else {
        lineCorrect = await playFullLine(lineData.parts, missedWords, answers);
      }
      correctCount += lineCorrect;

      console.log(`  ${renderLineWithAnswers(lineData.parts, answers)}`);
    }
  }

  const pct = totalBlanks > 0 ? Math.round((correctCount / totalBlanks) * 100) : 0;
  const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
  console.log(chalk.bold(`\n──────── Sesión terminada ────────`));
  console.log(`  ${bar} ${pct}%`);
  console.log(`  Correctas: ${chalk.green(correctCount)} / ${totalBlanks}`);
  if (missedWords.size > 0) {
    console.log(`  Falladas:  ${chalk.red([...missedWords].join(', '))}`);
  }
  console.log(chalk.bold(`─────────────────────────────────\n`));

  if (missedWords.size > 0) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: '¿Guardar palabras falladas al vocabulario?',
      default: true,
    }]);

    if (confirm) {
      for (const word of missedWords) {
        const { translation } = await inquirer.prompt([{
          type: 'input',
          name: 'translation',
          message: `Traducción al español de "${chalk.yellow(word)}":`,
        }]);
        if (translation.trim()) {
          await saveWord({ word, translation: translation.trim() });
        }
      }
      console.log(chalk.green('\n✔ Palabras guardadas al vocabulario.\n'));
    }
  }
}
