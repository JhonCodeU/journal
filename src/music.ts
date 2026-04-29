import 'dotenv/config';
import inquirer from 'inquirer';
import chalk from 'chalk';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { saveWord } from './vocabularyManager.js';

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

    const lyricsContainers = $('[data-lyrics-container="true"], .lyrics');
    if (lyricsContainers.length === 0) return null;

    let fullText = '';
    lyricsContainers.each((_, elem) => {
      const html = $(elem).html() || '';
      fullText += html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') + '\n\n';
    });

    // FIX 1: Filtrar líneas de metadata de Genius
    // Genius mete "NContributorsTranslations[idiomas]..." antes del primer verso.
    // Detectamos el primer encabezado de sección real y descartamos todo lo anterior.
    const rawLines = fullText.split('\n');
    let firstSectionFound = false;
    const cleanLines: string[] = [];

    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!firstSectionFound) {
        // El primer encabezado de sección [Verse 1], [Intro], etc. marca el inicio real
        if (/^\[.+\]$/.test(trimmed)) {
          firstSectionFound = true;
          cleanLines.push(trimmed);
        }
        // Descartamos todo hasta encontrar la primera sección
        continue;
      }
      cleanLines.push(trimmed);
    }

    if (cleanLines.length === 0) return null;

    // Parsear secciones desde las líneas limpias
    const sections: { title: string; lines: string[] }[] = [];
    let currentSection: { title: string; lines: string[] } = { title: 'Intro', lines: [] };

    for (const line of cleanLines) {
      if (line === '') continue;
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
      // Dividir respetando espacios y puntuación
      const tokens = line.split(/(\s+)/);
      const fillableIndices: number[] = [];

      tokens.forEach((token, i) => {
        if (token.trim() !== '' && /[a-zA-Z]/.test(token)) {
          fillableIndices.push(i);
        }
      });

      const targetCount = Math.max(1, Math.ceil(fillableIndices.length * difficulty));
      const indicesToBlank = new Set<number>();

      // Selección aleatoria sin repetición
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
    return chalk.bgBlackBright.yellow(` [${p.content.length}] `);  // Muestra el largo del blank
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

// FIX 2 + 3: Modo palabra por palabra — un prompt por blank, con hint y skip
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
      // Pista: primera letra
      console.log(chalk.yellow(`  💡 Pista: la palabra empieza con "${blank.content[0].toUpperCase()}"`));
      // Segundo intento
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
      // Skip
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

// Modo Multiple Choice - Elegir entre 3 opciones
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
    
    // Generar distractores de la misma canción
    let distractors = allWords
      .filter(w => normalizeWord(w) !== expected)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    
    // Si no hay suficientes palabras, usar comunes
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

// FIX 2 + 3: Modo línea completa — todas las palabras en un input, con hint y skip
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
    // Pista: primera letra de cada blank
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
      value: hit.result.url,
    })),
    new inquirer.Separator(),
    { name: 'Volver al menú', value: 'back' },
  ];

  const { selectedSongUrl } = await inquirer.prompt([{
    type: 'select',
    name: 'selectedSongUrl',
    message: 'Selecciona la canción:',
    choices,
    loop: false,
  }]);

  if (selectedSongUrl === 'back') return;

  // FIX 4: Configuración de sesión antes de cargar la letra
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

  console.log(chalk.blue('\nObteniendo letra...'));
  const lyricSections = await getLyricsFromGeniusPage(selectedSongUrl);

  if (!lyricSections || lyricSections.length === 0) {
    console.log(chalk.red('No se pudo obtener la letra.\n'));
    return;
  }

  console.log(chalk.green('¡Letra encontrada! Prepárate.\n'));
  const youtubeLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  console.log(`🎧 Escúchala aquí: ${chalk.underline.blue(youtubeLink)}\n`);

  const { processedSections, totalBlanks } = createFillInTheBlanks(lyricSections, difficulty);
  const allWordsInSong = getAllWordsFromSections(lyricSections);

  const missedWords = new Set<string>();
  const answers = new Map<number, string>();
  let correctCount = 0;
  let sectionsDone = 0;
  const totalSections = processedSections.length;

  // FIX 5: Progreso visible por sección
  for (const section of processedSections) {
    sectionsDone++;
    const progress = chalk.dim(`[${sectionsDone}/${totalSections}]`);
    console.log(chalk.magenta.bold(`\n${progress} ── ${section.title} ──`));

    for (const lineData of section.lines) {
      const blanks = lineData.parts.filter(p => p.type === 'blank');
      if (blanks.length === 0) {
        // Línea sin blanks: mostrar tal cual
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

      // Mostrar la línea completa con resultado visual
      console.log(`  ${renderLineWithAnswers(lineData.parts, answers)}`);
    }
  }

  // FIX 6: Resumen final mejorado
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