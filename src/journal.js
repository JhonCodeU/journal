const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs');
const SpellChecker = require('spellchecker');
const LanguageTool = require('languagetool-api');

const DB_FILE = './storage.json';

function getEntries() {
  if (!fs.existsSync(DB_FILE)) {
    return [];
  }
  const content = fs.readFileSync(DB_FILE, 'utf8');
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error(chalk.red('Error parsing storage.json. Starting with an empty list.'));
    return [];
  }
}

function saveEntries(entries) {
  fs.writeFileSync(DB_FILE, JSON.stringify(entries, null, 2));
}

async function addEntry() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'podcastName',
      message: 'Podcast/Audio Name:',
    },
    {
      type: 'input',
      name: 'episode',
      message: 'Episode/Chapter:',
    },
    {
      type: 'editor',
      name: 'description',
      message: 'What did you hear? (Grammar check will follow)',
    },
  ]);

  let description = answers.description;

  // --- Spell Check (existing functionality) ---
  const misspelled = SpellChecker.checkSpelling(description);
  if (misspelled.length > 0) {
    console.log(chalk.yellow('\n--- Potential Spelling Mistakes ---'));
    misspelled.forEach(word => {
      console.log(chalk.red(word.word));
    });
    console.log('-----------------------------------');
  }

  // --- Grammar Check (new functionality) ---
  console.log(chalk.blue('\nChecking grammar and style...'));
  try {
    // Correct way to call the check method from the LanguageTool object
    const grammarCheckResult = await new Promise((resolve, reject) => {
      LanguageTool.check({ text: description, language: 'en-US' }, (error, output) => {
        if (error) {
          reject(error);
        } else {
          resolve(output);
        }
      });
    });

    if (grammarCheckResult.matches && grammarCheckResult.matches.length > 0) {
      console.log(chalk.yellow('\n--- Grammar and Style Suggestions ---'));
      let currentText = description;
      let offsetAdjustment = 0;

      for (const match of grammarCheckResult.matches) {
        const originalLength = match.length;
        const replacement = match.replacements && match.replacements.length > 0 ? match.replacements[0].value : '';
        const startIndex = match.offset + offsetAdjustment;
        const endIndex = startIndex + originalLength;

        const highlightedError = chalk.bgRed.white(currentText.substring(startIndex, endIndex));
        const contextBefore = currentText.substring(Math.max(0, startIndex - 20), startIndex);
        const contextAfter = currentText.substring(endIndex, Math.min(currentText.length, endIndex + 20));

        console.log(`\n${chalk.bold('Error:')} ${match.message}`);
        console.log(`${chalk.bold('Category:')} ${match.rule.category.name}`);
        console.log(`${chalk.bold('Context:')} ...${contextBefore}${highlightedError}${contextAfter}...`);
        if (replacement) {
          console.log(`${chalk.bold('Suggestion:')} ${chalk.green(replacement)}`);
        }

        const { applyCorrection } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'applyCorrection',
            message: 'Apply this correction?',
            default: false,
          },
        ]);

        if (applyCorrection) {
          currentText = currentText.substring(0, startIndex) + replacement + currentText.substring(endIndex);
          offsetAdjustment += (replacement.length - originalLength);
          console.log(chalk.green('Correction applied.'));
        } else {
          console.log(chalk.gray('Correction skipped.'));
        }
      }
      description = currentText;
      console.log(chalk.yellow('-------------------------------------'));
      console.log(chalk.bold('\nFinal text after corrections:\n'));
      console.log(description);
      console.log('\n');

    } else {
      console.log(chalk.green('No grammar or style issues found. Great job!'));
    }
  } catch (error) {
    console.error(chalk.red('Error during grammar check:'), error.message);
    console.log(chalk.red('Could not perform grammar check. Please ensure you have an internet connection.'));
  }

  const entries = getEntries();
  entries.push({ ...answers, description: description }); // Save the potentially corrected description
  saveEntries(entries);
  console.log(chalk.green('Entry saved!'));
}

function viewEntries() {
  const entries = getEntries();
  if (entries.length === 0) {
    console.log(chalk.yellow('No entries yet.'));
    return;
  }

  entries.forEach((entry, index) => {
    console.log(chalk.cyan.bold(`\n--- Entry ${index + 1} ---\n`));
    console.log(chalk.green(`Podcast/Audio:`), entry.podcastName);
    console.log(chalk.green(`Episode/Chapter:`), entry.episode);
    console.log(chalk.green(`Description:`), entry.description);
  });
}

module.exports = { addEntry, viewEntries };
