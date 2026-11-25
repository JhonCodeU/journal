#!/usr/bin/env node
// git commit-msg hook: checks the English of your commit message with Ollama.
//
// It NEVER blocks a commit: any error, timeout or missing Ollama just exits 0.
// Skip it for one commit with:  JOURNAL_SKIP_COMMIT_CHECK=1 git commit ...
// Change the model with:        JOURNAL_COMMIT_MODEL=llama3
//
// Plain JS with no dependencies so it runs from any repository.

import fs from 'node:fs';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.JOURNAL_COMMIT_MODEL || 'qwen2.5:3b';
const TIMEOUT_MS = Number(process.env.JOURNAL_COMMIT_TIMEOUT_MS) || 20000;

const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
};

/** Removes git's comment lines and everything below the `git commit -v` scissors. */
export function cleanMessage(raw) {
  const scissors = raw.indexOf('# ------------------------ >8 ------------------------');
  const body = scissors >= 0 ? raw.slice(0, scissors) : raw;
  return body
    .split('\n')
    .filter(line => !line.startsWith('#'))
    .join('\n')
    .trim();
}

/** Returns a reason to skip the check, or null if the message should be checked. */
export function skipReason(message) {
  if (process.env.JOURNAL_SKIP_COMMIT_CHECK) return 'JOURNAL_SKIP_COMMIT_CHECK is set';
  if (!message) return 'empty message';
  if (/^(Merge|Revert ")|^(fixup|squash|amend)! /.test(message)) return 'generated message';
  // Drop a conventional-commit prefix ("feat(api)!: ") before counting words.
  const prose = message.replace(/^\w+(\([^)]*\))?!?:\s*/, '');
  if (prose.split(/\s+/).filter(Boolean).length < 3) return 'too short';
  return null;
}

async function review(message) {
  const prompt = `You review the English of git commit messages written by a Spanish-speaking developer who is learning English.

Commit message:
"""
${message}
"""

Rules:
- Only flag real grammar, spelling or word-choice mistakes.
- Do NOT flag commit-message style: imperative mood ("add", "fix"), missing final period, lowercase start, conventional prefixes like "feat:" or "fix(api):".
- Do NOT touch code identifiers, file names, paths or anything inside backticks.
- Explanations must be short and in Spanish.

Reply with ONLY this JSON:
{"ok": true|false, "corrected": "full corrected message, same format", "notes": [{"original": "...", "corrected": "...", "explanation": "..."}]}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false, format: 'json', options: { temperature: 0.1 } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.response);
}

async function main() {
  const file = process.argv[2];
  if (!file) return;
  const message = cleanMessage(fs.readFileSync(file, 'utf8'));
  if (skipReason(message)) return;

  process.stdout.write(c.dim('📝 Checking your commit English... '));
  let result;
  try {
    result = await review(message);
  } catch (err) {
    const why = err?.name === 'TimeoutError' ? 'timed out' : 'Ollama not available';
    console.log(c.dim(`skipped (${why})`));
    return;
  }

  const notes = Array.isArray(result?.notes)
    ? result.notes.filter(n => n?.original && n?.corrected && n.original.trim() !== n.corrected.trim())
    : [];

  if (result?.ok !== false || notes.length === 0) {
    console.log(c.green('✔ looks good!'));
    return;
  }

  console.log(c.yellow(`${notes.length} suggestion(s):`));
  for (const n of notes) {
    console.log(`  ${c.red(n.original)} → ${c.green(n.corrected)}`);
    if (n.explanation) console.log(`    ${c.dim(n.explanation)}`);
  }
  if (result.corrected && result.corrected.trim() !== message) {
    console.log(`\n  ${c.cyan('Suggested:')} ${result.corrected.trim().split('\n')[0]}`);
    console.log(c.dim('  Fix it with: git commit --amend'));
  }
  console.log('');
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1]?.endsWith('check-commit.mjs')) {
  main().catch(() => {}).finally(() => process.exit(0));
}
