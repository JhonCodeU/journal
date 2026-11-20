#!/usr/bin/env node
// Prints how many vocabulary words are due for review, for use in a shell prompt.
//
//   journal-status.mjs          → "📚 5" (prints nothing when there is nothing due)
//   journal-status.mjs --plain  → "5"   (always prints a number)
//
// Plain JS with no dependencies on purpose: it runs on every prompt, so it must
// start fast (~40ms) and must never print errors into your prompt.
// The due-date logic mirrors getWordsToReview() in src/srs.ts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabFile = path.join(root, 'data', 'vocabulary.json');
const plain = process.argv.includes('--plain');
const DAY = 24 * 60 * 60 * 1000;

let due = 0;
try {
  const vocabulary = JSON.parse(fs.readFileSync(vocabFile, 'utf8'));
  const now = Date.now();
  for (const word of vocabulary) {
    const last = word.lastReviewed ? new Date(word.lastReviewed).getTime() : 0;
    const interval = word.strength || 1;
    if ((now - (Number.isNaN(last) ? 0 : last)) / DAY >= interval) due++;
  }
} catch {
  // Missing or broken file: stay silent rather than break the prompt.
}

if (plain) process.stdout.write(String(due));
else if (due > 0) process.stdout.write(`📚 ${due}`);
