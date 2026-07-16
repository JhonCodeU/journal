import inquirer from 'inquirer';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { addXP } from './statsManager.js';
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

// ── Load readings ────────────────────────────────────────────────
function loadReadings(): Reading[] {
  const all: Reading[] = [];

  // Load UVic scraped readings if available
  if (fs.existsSync(UVIC_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(UVIC_FILE, 'utf-8'));
      all.push(...data);
    } catch {}
  }

  return all;
}

function flattenReadings(): Reading[] {
  return loadReadings();
}

// ── Audio ────────────────────────────────────────────────────────
const AUDIO_CACHE_DIR = path.join(DATA_DIR, 'audio-cache');

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        const redirectUrl = new URL(response.headers.location, url).href;
        const p2 = redirectUrl.startsWith('https') ? https : http;
        p2.get(redirectUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
          if (res2.statusCode !== 200) { reject(new Error(`HTTP ${res2.statusCode}`)); return; }
          res2.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
        return;
      }
      if (response.statusCode !== 200) { reject(new Error(`HTTP ${response.statusCode}`)); return; }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

async function playAudio(audioUrl: string, id: string): Promise<void> {
  const ext = path.extname(audioUrl) || '.mp3';
  const cachePath = path.join(AUDIO_CACHE_DIR, `${id}${ext}`);

  if (!fs.existsSync(cachePath)) {
    console.log(chalk.blue('\n⏬ Downloading audio...'));
    fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
    try {
      await downloadFile(audioUrl, cachePath);
      console.log(chalk.green('  ✔ Downloaded!\n'));
    } catch {
      console.log(chalk.yellow('  ⚠️  Could not download audio.\n'));
      return;
    }
  }

  return new Promise((resolve) => {
    console.log(chalk.gray('  Controls: Space(pause) · ←/→(10s) · ↑/↓(1min) · Esc(stop)\n'));
    // Pass the real TTY so ffplay gets keyboard input directly
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

  // Derive audio URL from id using UVic pattern
  const audioUrl = `https://continuingstudies.uvic.ca/upload/elc/studyzone/200-stories-cam/${reading.id}.mp3`;

  if (action === 'audio') {
    await playAudio(audioUrl, reading.id);
    console.log(chalk.cyan.bold('\nRead the text below:\n'));
    console.log(chalk.white(reading.text));
  } else {
    console.log(chalk.cyan.bold('\nRead the text below:\n'));
    console.log(chalk.white(reading.text));
    console.log(chalk.blue('\n' + '═'.repeat(56)));

    const { listen } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'listen',
        message: 'Would you like to listen to the audio too?',
        default: false,
      },
    ]);

    if (listen) {
      await playAudio(audioUrl, reading.id);
    }
  }

  console.log(chalk.blue('\n' + '═'.repeat(56)));

  const { ready } = await inquirer.prompt([
    { type: 'confirm', name: 'ready', message: 'Ready to answer the questions?', default: true },
  ]);

  if (!ready) return;

  // Check if we have real correct answers (non-scraped data)
  const hasAnswers = reading.questions.some(q => q.correct !== 0);

  let correctCount = 0;

  for (let i = 0; i < reading.questions.length; i++) {
    const q = reading.questions[i];
    console.log(chalk.cyan.bold(`\nQuestion ${i + 1} of ${reading.questions.length}:`));
    console.log(chalk.white(q.question));

    const { answer } = await inquirer.prompt([
      {
        type: 'list',
        name: 'answer',
        message: 'Choose the best answer:',
        choices: q.options.map((opt, idx) => ({ name: `${opt}`, value: idx })),
      },
    ]);

    if (hasAnswers) {
      if (answer === q.correct) {
        console.log(chalk.green('  ✔ Correct!\n'));
        correctCount++;
      } else {
        console.log(chalk.red(`  ✘ Incorrect. The correct answer is: "${chalk.bold(q.options[q.correct])}"\n`));
      }
    } else {
      // No answer key — user self-evaluates
      const { right } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'right',
          message: 'Was your answer correct?',
          default: true,
        },
      ]);
      if (right) correctCount++;
      console.log(right ? chalk.green('  ✔ Noted!\n') : chalk.red('  ✘ Noted. Re-read the text to find the correct answer.\n'));
    }

    await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Press Enter to continue...' }]);
  }

  const xp = hasAnswers ? correctCount * 20 : reading.questions.length * 15;
  addXP(xp);
  console.log(chalk.blue('═'.repeat(56)));
  console.log(chalk.magenta.bold(`\n📊 ${hasAnswers ? `Results: ${correctCount}/${reading.questions.length} correct!` : 'Reading complete!'}`));
  console.log(chalk.green.bold(`➕ ${xp} XP gained!`));

  if (correctCount === reading.questions.length) {
    console.log(chalk.yellow.bold('\n🎉 Perfect score! Excellent reading comprehension!\n'));
  } else if (correctCount >= reading.questions.length * 0.6) {
    console.log(chalk.green.bold('\nGood job! Keep practicing to improve!\n'));
  } else {
    console.log(chalk.yellow.bold('\nKeep practicing! Try reading the text more carefully.\n'));
  }
}

// ── Main menu ────────────────────────────────────────────────────
export async function interactiveReadingComprehension(): Promise<void> {
  const allReadings = flattenReadings();

  if (allReadings.length === 0) {
    console.log(chalk.yellow('\nNo readings available. Run: npx tsx scripts/scrape-uvic.ts\n'));
    return;
  }

  // Get unique levels
  const levels = [...new Set(allReadings.map(r => r.level))].sort();

  while (true) {
    console.log(chalk.magenta.bold('\n📖 Reading Comprehension\n'));
    console.log(chalk.gray(`${allReadings.length} texts · ${levels.join(' · ')}\n`));

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

    const filtered = levelChoice === 'all'
      ? allReadings
      : allReadings.filter(r => r.level === levelChoice);

    const { readingId } = await inquirer.prompt([
      {
        type: 'select',
        name: 'readingId',
        message: 'Select a reading:',
        choices: [
          ...filtered.map((r) => ({
            name: `${r.title} — ${r.questions.length} questions`,
            value: r.id,
          })),
          new inquirer.Separator(),
          { name: '↩️  Back to levels', value: 'back' },
        ],
      },
    ]);

    if (readingId === 'back') continue;

    const reading = allReadings.find((r) => r.id === readingId)!;
    // Scraped readings don't have correct answers; set all to 0 so user discovers themselves
    // (questions still function correctly for checking answers)
    await audioAction(reading);
  }
}
