#!/usr/bin/env node
// Installs (or removes) the English commit-message checker in a git repository.
//
//   npm run hook:install                        → repo where you ran npm
//   npm run hook:install -- ~/code/my-project   → a specific repo
//   npm run hook:uninstall -- ~/code/my-project
//
// It refuses to overwrite a commit-msg hook that it did not create.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MARKER = '# english-journal commit-msg hook';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checker = path.join(root, 'bin', 'check-commit.mjs');

const args = process.argv.slice(2);
const uninstall = args.includes('--uninstall');
// npm runs scripts from the package root; INIT_CWD is where you actually typed the command.
const target = path.resolve(args.find(a => !a.startsWith('--')) || process.env.INIT_CWD || process.cwd());

let hooksDir;
try {
  hooksDir = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: target, encoding: 'utf8' }).trim();
  hooksDir = path.resolve(target, hooksDir);
} catch {
  console.error(`✘ ${target} is not a git repository.`);
  process.exit(1);
}

const hookFile = path.join(hooksDir, 'commit-msg');
const existing = fs.existsSync(hookFile) ? fs.readFileSync(hookFile, 'utf8') : null;
const ours = existing?.includes(MARKER);

if (uninstall) {
  if (!existing) console.log('Nothing to remove: no commit-msg hook found.');
  else if (!ours) console.log('✘ The existing commit-msg hook was not created by english-journal; leaving it alone.');
  else {
    fs.unlinkSync(hookFile);
    console.log(`✔ Removed ${hookFile}`);
  }
  process.exit(0);
}

if (existing && !ours) {
  console.error(`✘ ${hookFile} already exists and was not created by english-journal.`);
  console.error('  To use both, add this line to that hook:');
  console.error(`  node "${checker}" "$1" || true`);
  process.exit(1);
}

fs.mkdirSync(hooksDir, { recursive: true });
fs.writeFileSync(hookFile, `#!/bin/sh\n${MARKER}\n# Never blocks the commit. Remove with: npm run hook:uninstall\nnode "${checker}" "$1" || true\n`);
fs.chmodSync(hookFile, 0o755);
console.log(`✔ Commit English checker installed in ${target}`);
console.log('  Requires Ollama running locally. Skip once with JOURNAL_SKIP_COMMIT_CHECK=1');
