import inquirer from 'inquirer';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { addXP } from './statsManager.js';
import { getKeyVocabulary, evaluateAnswer } from './aiManager.js';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';

interface Question {
  question: string;
  options: string[];
  correct: number;
}

interface Reading {
  id: string;
  title: string;
  level: string;
  text: string;
  questions: Question[];
}

const DATA_DIR = path.resolve(import.meta.dirname, '..', 'data');
const UVIC_FILE = path.join(DATA_DIR, 'uvic-readings.json');
const COMPLETED_FILE = path.join(DATA_DIR, 'completed-readings.json');

// ── Completed readings ───────────────────────────────────────────
function getCompleted(): Set<string> {
  try {
    return new Set(JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf-8')));
  } catch {
    return new Set();
  }
}

function markCompleted(id: string): void {
  const completed = getCompleted();
  completed.add(id);
  fs.writeFileSync(COMPLETED_FILE, JSON.stringify([...completed]));
}

// ── Load readings ────────────────────────────────────────────────
function loadReadings(): Reading[] {
  if (fs.existsSync(UVIC_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(UVIC_FILE, 'utf-8'));
    } catch {}
  }
  return [];
}

// ── Audio ────────────────────────────────────────────────────────
const AUDIO_CACHE_DIR = path.join(DATA_DIR, 'audio-cache');

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    const get = (u: string, d: string, r?: number) => {
      protocol.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close(); fs.unlink(d, () => {});
          const redirect = new URL(res.headers.location, u).href;
          const p2 = redirect.startsWith('https') ? https : http;
          return p2.get(redirect, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r2) => {
            if (r2.statusCode !== 200) { reject(new Error(`HTTP ${r2.statusCode}`)); return; }
            r2.pipe(file); file.on('finish', () => { file.close(); resolve(); });
          }).on('error', (e) => { fs.unlink(d, () => {}); reject(e); });
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        res.pipe(file); file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    };
    get(url, dest);
  });
}

async function playAudio(audioUrl: string, id: string): Promise<void> {
  const ext = path.extname(audioUrl) || '.mp3';
  const cachePath = path.join(AUDIO_CACHE_DIR, `${id}${ext}`);
  if (!fs.existsSync(cachePath)) {
    console.log(chalk.blue('\n⏬ Downloading audio...'));
    fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
    try { await downloadFile(audioUrl, cachePath); console.log(chalk.green('  ✔ Downloaded!\n')); }
    catch { console.log(chalk.yellow('  ⚠️  Could not download audio.\n')); return; }
  }
  return new Promise((resolve) => {
    console.log(chalk.gray('  Controls: Space(pause) · ←/→(10s) · ↑/↓(1min) · Esc(stop)\n'));
    let tty: number | undefined;
    try { tty = fs.openSync('/dev/tty', 'r+'); } catch {}
    const player = spawn('ffplay', ['-nodisp', '-autoexit', cachePath], {
      stdio: tty !== undefined ? [tty, 'inherit', 'inherit'] : ['inherit', 'inherit', 'inherit'],
    });
    player.on('close', () => { if (tty !== undefined) fs.closeSync(tty); resolve(); });
  });
}

// ── Study session ────────────────────────────────────────────────
async function audioAction(reading: Reading): Promise<void> {
  console.log(chalk.magenta.bold(`\n📖 ${reading.title}`));
  console.log(chalk.gray(`Level: ${reading.level}`));
  console.log(chalk.blue('═'.repeat(56)));

  // Start loading vocabulary in the background while user reads/listens
  const vocabPromise = getKeyVocabulary(reading.text);

  // Step 1: Choose study method
  const { action } = await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: 'How would you like to study?',
      choices: [
        { name: '🎧  Listen to audio first', value: 'audio' },
        { name: '📖  Read the text first', value: 'read' },
        { name: '↩️  Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') return;

  const audioUrl = `https://continuingstudies.uvic.ca/uploads/elc/studyzone/200-stories-cam/${reading.id}.mp3`;

  if (action === 'audio') {
    await playAudio(audioUrl, reading.id);
    console.log(chalk.cyan.bold('\nRead the text below:\n'));
    console.log(chalk.white(reading.text));
  } else {
    console.log(chalk.cyan.bold('\nRead the text below:\n'));
    console.log(chalk.white(reading.text));
    console.log(chalk.blue('\n' + '═'.repeat(56)));
    const { listen } = await inquirer.prompt([
      { type: 'confirm', name: 'listen', message: 'Would you like to listen to the audio too?', default: false },
    ]);
    if (listen) await playAudio(audioUrl, reading.id);
  }

  // Show vocabulary (should be ready now since it loaded in background)
  console.log(chalk.cyan.bold('\n📝 Key Vocabulary:\n'));
  const vocab = await vocabPromise;
  if (vocab.length > 0) {
    for (const v of vocab) {
      console.log(chalk.yellow(`  ${v.word}`) + chalk.white(` — ${v.translation}`));
    }
    await inquirer.prompt([{ type: 'input', name: '_', message: '\nPress Enter to start questions...' }]);
  }

  console.log(chalk.blue('\n' + '═'.repeat(56)));

  const { ready } = await inquirer.prompt([
    { type: 'confirm', name: 'ready', message: 'Ready to answer the questions?', default: true },
  ]);
  if (!ready) return;

  // Step 3: Answer questions with AI evaluation
  const hasAnswers = reading.questions.some(q => q.correct !== 0);
  let correctCount = 0;

  for (let i = 0; i < reading.questions.length; i++) {
    const q = reading.questions[i];
    console.log(chalk.cyan.bold(`\nQuestion ${i + 1} of ${reading.questions.length}:`));
    console.log(chalk.white(q.question));

    const { answer } = await inquirer.prompt([
      {
        type: 'select',
        name: 'answer',
        message: 'Choose the best answer:',
        choices: q.options.map((opt, idx) => ({ name: `${opt}`, value: idx })),
      },
    ]);

    if (hasAnswers) {
      if (answer === q.correct) { console.log(chalk.green('  ✔ Correct!\n')); correctCount++; }
      else { console.log(chalk.red(`  ✘ Incorrect. The correct answer is: "${chalk.bold(q.options[q.correct])}"\n`)); }
    } else {
      // AI evaluation
      console.log(chalk.blue('\n  🤖 AI is evaluating your answer...'));
      const result = await evaluateAnswer(q.question, q.options[answer], reading.text);
      if (result.correct) { console.log(chalk.green('  ✔ ' + result.explanation + '\n')); correctCount++; }
      else { console.log(chalk.red('  ✘ ' + result.explanation + '\n')); }
    }

    await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Press Enter to continue...' }]);
  }

  // Step 4: Mark as completed and award XP
  markCompleted(reading.id);
  const xp = hasAnswers ? correctCount * 20 : reading.questions.length * 15;
  addXP(xp);

  console.log(chalk.blue('═'.repeat(56)));
  console.log(chalk.magenta.bold(`\n📊 ${hasAnswers ? `Results: ${correctCount}/${reading.questions.length} correct!` : 'Reading complete!'}`));
  console.log(chalk.green.bold(`➕ ${xp} XP gained!`));
  console.log(chalk.yellow.bold('✅ Marked as completed!\n'));
}

// ── Main menu ────────────────────────────────────────────────────
export async function interactiveReadingComprehension(): Promise<void> {
  const allReadings = loadReadings();
  if (allReadings.length === 0) {
    console.log(chalk.yellow('\nNo readings available. Run: npx tsx scripts/scrape-uvic.ts\n'));
    return;
  }

  const levels = [...new Set(allReadings.map(r => r.level))].sort();

  while (true) {
    const completed = getCompleted();
    const completedCount = allReadings.filter(r => completed.has(r.id)).length;
    console.log(chalk.magenta.bold('\n📖 Reading Comprehension\n'));
    console.log(chalk.gray(`${completedCount}/${allReadings.length} completed · ${levels.join(' · ')}\n`));

    const { levelChoice } = await inquirer.prompt([
      {
        type: 'select',
        name: 'levelChoice',
        message: 'Select a level:',
        choices: [
          { name: `🌍 All Levels (${allReadings.length})`, value: 'all' },
          ...levels.map(l => {
            const count = allReadings.filter(r => r.level === l).length;
            return { name: `${l} (${count})`, value: l };
          }),
          new inquirer.Separator(),
          { name: '↩️  Back to main menu', value: 'back' },
        ],
      },
    ]);

    if (levelChoice === 'back') return;

    const filtered = levelChoice === 'all' ? allReadings : allReadings.filter(r => r.level === levelChoice);

    const { readingId } = await inquirer.prompt([
      {
        type: 'select',
        name: 'readingId',
        message: 'Select a reading:',
        choices: [
          ...filtered.map((r) => ({
            name: `${r.title} — ${r.questions.length} questions${completed.has(r.id) ? ' ✅' : ''}`,
            value: r.id,
          })),
          new inquirer.Separator(),
          { name: '↩️  Back to levels', value: 'back' },
        ],
      },
    ]);

    if (readingId === 'back') continue;

    const reading = allReadings.find((r) => r.id === readingId)!;
    await audioAction(reading);
  }
}
