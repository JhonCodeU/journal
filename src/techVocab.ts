import fs from 'fs';
import path from 'path';
import tty from 'tty';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { commonWords } from './vocabulary.js';
import { getVocabulary, saveWord } from './vocabularyManager.js';
import { getBatchTranslations } from './aiManager.js';
import { addXP } from './statsManager.js';
import { wordRegExp } from './utils.js';

/**
 * Tech vocabulary: learn the English you meet while programming.
 *
 *   npm run tech -- README.md          a file
 *   npm run tech -- ../my-project      a folder (reads its README / docs/*.md)
 *   npm test 2>&1 | npm run tech       error messages or any command output
 *   npm run tech                       paste text in your editor
 */

const MAX_WORDS = 20;

// Words every developer already reads daily; not worth reviewing.
const DEV_JARGON = new Set([
  'api', 'apis', 'app', 'apps', 'args', 'array', 'arrays', 'async', 'await', 'bool', 'boolean',
  'branch', 'build', 'bug', 'bugs', 'cli', 'commit', 'config', 'const', 'css', 'debug', 'deploy',
  'dev', 'docs', 'enum', 'env', 'error', 'errors', 'false', 'func', 'function', 'functions',
  'git', 'github', 'html', 'http', 'https', 'import', 'json', 'lib', 'localhost', 'log', 'logs',
  'merge', 'node', 'npm', 'null', 'object', 'objects', 'params', 'pull', 'push', 'readme',
  'repo', 'src', 'string', 'strings', 'sudo', 'todo', 'true', 'typescript', 'undefined', 'url',
  'urls', 'yarn', 'pnpm', 'linux', 'windows', 'macos', 'install', 'npx', 'tsx', 'eslint',
]);

export interface TechWord {
  word: string;
  count: number;
  context: string;
}

/** Removes code blocks, inline code, URLs and file paths so only prose is left. */
function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\bhttps?:\/\/\S+/g, ' ')
    .replace(/\x1b\[[0-9;]*m/g, ' '); // ANSI colors from terminal output
}

/** Looks like code rather than an English word: camelCase, snake_case, paths, digits, CONSTANTS. */
function looksLikeCode(token: string): boolean {
  return /[_\/\\.$@#<>{}=\d]/.test(token)
    || /[a-z][A-Z]/.test(token)
    || (token.length > 1 && token === token.toUpperCase());
}

function isKnown(word: string, known: Set<string>): boolean {
  const candidates = [
    word,
    word.replace(/'s$/, ''),
    word.replace(/s$/, ''),
    word.replace(/es$/, ''),
    word.replace(/ies$/, 'y'),
    word.replace(/ed$/, ''),
    word.replace(/d$/, ''),
    word.replace(/ing$/, ''),
    word.replace(/ing$/, 'e'),
    word.replace(/ly$/, ''),
  ];
  return candidates.some(c => commonWords.has(c) || known.has(c) || DEV_JARGON.has(c));
}

function findContext(text: string, word: string): string {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  const found = sentences.find(s => wordRegExp(word, 'i').test(s));
  return (found ?? '').replace(/\s+/g, ' ').trim().substring(0, 140);
}

/** Finds uncommon English words in technical text, most frequent first. */
export function extractTechWords(text: string, knownWords: Iterable<string> = []): TechWord[] {
  const known = new Set([...knownWords].map(w => w.toLowerCase()));
  const prose = stripCode(text);
  const counts = new Map<string, number>();

  for (const raw of prose.split(/\s+/)) {
    // Trim surrounding punctuation like quotes, commas, brackets, colons.
    const token = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
    if (token.length < 4 || looksLikeCode(token) || !/^[A-Za-z]+(?:'[a-z]+)?$/.test(token)) continue;

    const word = token.toLowerCase();
    if (isKnown(word, known)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_WORDS)
    .map(([word, count]) => ({ word, count, context: findContext(prose, word) }));
}

// ── Input ────────────────────────────────────────────────────────

function readFromPath(target: string): string {
  const full = path.resolve(process.env.INIT_CWD || process.cwd(), target);
  if (!fs.existsSync(full)) throw new Error(`Not found: ${full}`);

  if (fs.statSync(full).isFile()) return fs.readFileSync(full, 'utf8');

  // A folder: read its README and Markdown docs.
  const files = fs.readdirSync(full)
    .filter(f => /^readme(\.md|\.txt)?$/i.test(f) || /^contributing\.md$/i.test(f))
    .map(f => path.join(full, f));
  const docsDir = path.join(full, 'docs');
  if (fs.existsSync(docsDir) && fs.statSync(docsDir).isDirectory()) {
    files.push(...fs.readdirSync(docsDir).filter(f => f.endsWith('.md')).map(f => path.join(docsDir, f)));
  }
  if (files.length === 0) throw new Error(`No README or docs/*.md found in ${full}`);
  console.log(chalk.gray(`Reading: ${files.map(f => path.relative(full, f)).join(', ')}`));
  return files.map(f => fs.readFileSync(f, 'utf8')).join('\n\n');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * When text arrives through a pipe, stdin is already used up, so questions are
 * asked through the terminal device instead. Returns null if there is none.
 */
function terminalPrompt(): typeof inquirer.prompt | null {
  if (process.stdin.isTTY) return inquirer.prompt;
  try {
    const fd = fs.openSync('/dev/tty', 'r');
    const input = new tty.ReadStream(fd);
    return inquirer.createPromptModule({ input, output: process.stdout }) as unknown as typeof inquirer.prompt;
  } catch {
    return null;
  }
}

// ── Session ──────────────────────────────────────────────────────

export async function techVocabularySession(source?: string): Promise<void> {
  console.log(chalk.cyan.bold('\n🧑‍💻 Tech Vocabulary — learn the English in your code world\n'));

  let text = '';
  let prompt = inquirer.prompt;

  try {
    if (source) {
      text = readFromPath(source);
    } else if (!process.stdin.isTTY) {
      text = await readStdin();
      const fromTerminal = terminalPrompt();
      if (!fromTerminal) {
        // No way to ask questions: just show the words.
        printWords(extractTechWords(text, getVocabulary().map(v => v.word)));
        return;
      }
      prompt = fromTerminal;
    } else {
      const { mode } = await prompt([{
        type: 'select',
        name: 'mode',
        message: 'Where is the text?',
        choices: [
          { name: '📄 A file or project folder (README, docs)', value: 'path' },
          { name: '📋 Paste it (error message, docs, issue...)', value: 'paste' },
          { name: '↩️  Back', value: 'back' },
        ],
      }]);
      if (mode === 'back') return;
      if (mode === 'path') {
        const { target } = await prompt([{ type: 'input', name: 'target', message: 'Path:' }]);
        text = readFromPath(target.trim());
      } else {
        const { pasted } = await prompt([{
          type: 'editor',
          name: 'pasted',
          message: 'Your editor will open. Paste the text, save and close it.',
        }]);
        text = pasted;
      }
    }
  } catch (error: any) {
    console.log(chalk.red(`✘ ${error.message}`));
    return;
  }

  const words = extractTechWords(text, getVocabulary().map(v => v.word));
  if (words.length === 0) {
    console.log(chalk.green('✔ No new words here — you already know them all!\n'));
    return;
  }

  console.log(chalk.blue(`Found ${words.length} new word(s). Translating with AI...`));
  const translations = await getBatchTranslations(words.map(w => w.word));
  const translationOf = new Map(
    translations
      .filter(t => t?.word && typeof t.translation === 'string')
      .map(t => [t.word.toLowerCase(), t.translation.trim()])
  );

  const { selected } = await prompt([{
    type: 'checkbox',
    name: 'selected',
    message: 'Which words do you want to learn? (space to select, enter to confirm)',
    pageSize: 15,
    choices: words.map(w => ({
      name: `${chalk.yellow(w.word.padEnd(16))} ${chalk.green(translationOf.get(w.word) || '?')}  ${chalk.gray(`×${w.count}`)}`,
      value: w,
    })),
  }]);

  for (const w of selected as TechWord[]) {
    let translation = translationOf.get(w.word) || '';
    if (!translation) {
      const answer = await prompt([{ type: 'input', name: 'translation', message: `Translation for "${w.word}":` }]);
      translation = answer.translation.trim();
      if (!translation) continue;
    }
    if (w.context) console.log(chalk.gray(`  “${w.context}”`));
    await saveWord({ word: w.word, translation, context: w.context || undefined });
  }

  if (selected.length > 0) {
    addXP(selected.length * 2);
    console.log(chalk.green.bold(`\n✔ ${selected.length} word(s) added to your SRS review.\n`));
  }
}

function printWords(words: TechWord[]): void {
  if (words.length === 0) {
    console.log(chalk.green('✔ No new words here.'));
    return;
  }
  console.log(chalk.yellow('New words (no terminal available to save them):'));
  for (const w of words) console.log(`  ${chalk.yellow(w.word)}  ${chalk.gray(w.context)}`);
}
