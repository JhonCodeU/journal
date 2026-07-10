import axios from 'axios';
import * as cheerio from 'cheerio';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { commonWords } from './vocabulary.js';
import { getBatchTranslations, getPodcastVocab } from './aiManager.js';
import { saveWord, getVocabulary, markWordAsKnown } from './vocabularyManager.js';
import { addXP } from './statsManager.js';

interface NewsCategory {
  name: string;
  sources: { name: string; url: string }[];
}

const CATEGORIES: NewsCategory[] = [
  {
    name: '🌍 World News',
    sources: [
      { name: 'BBC World News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { name: 'VOA World News', url: 'https://learningenglish.voanews.com/api/zrqrmepi' },
    ]
  },
  {
    name: '🔬 Science & Technology',
    sources: [
      { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
      { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml' },
    ]
  },
  {
    name: '💼 Business',
    sources: [
      { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
    ]
  },
  {
    name: '🎭 Culture & Entertainment',
    sources: [
      { name: 'BBC Culture', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
    ]
  },
  {
    name: '🌱 Health & Environment',
    sources: [
      { name: 'BBC Health', url: 'https://feeds.bbci.co.uk/news/health/rss.xml' },
    ]
  },
  {
    name: '📖 Easy English (VOA Learning)',
    sources: [
      { name: 'VOA Learning English', url: 'https://learningenglish.voanews.com/api/zrqrmepi' },
      { name: 'VOA Words & Stories', url: 'https://learningenglish.voanews.com/api/zmmi' },
    ]
  },
];

interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  sourceName: string;
}

async function fetchRSS(url: string): Promise<NewsItem[]> {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    const $ = cheerio.load(data, { xmlMode: true });
    const items: NewsItem[] = [];

    $('item').each((_, el) => {
      const title = $(el).find('title').text().trim();
      const rawDesc = $(el).find('description').text().trim();
      const description = rawDesc.replace(/<[^>]*>/g, '').trim();
      const link = $(el).find('link').text().trim();
      const pubDate = $(el).find('pubDate').text().trim();
      if (title) items.push({ title, description, link, pubDate, sourceName: '' });
    });

    return items;
  } catch {
    return [];
  }
}

function highlightDifficult(text: string): string {
  const words = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
  const vocab = getVocabulary();
  const known = new Set(vocab.map(v => v.word.toLowerCase()));
  const difficult = new Set<string>();

  for (const w of words) {
    const c = w.toLowerCase();
    if (!commonWords.has(c) && !known.has(c)) difficult.add(w);
  }

  let result = text;
  for (const w of difficult) {
    result = result.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), chalk.yellow(w));
  }
  return result;
}

function extractContext(text: string, word: string): string {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  const found = sentences.find(s =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s)
  );
  return found ? found.trim().substring(0, 120) : text.substring(0, 100);
}

async function showArticleContent(item: NewsItem) {
  let content = `${item.title}\n\n${item.description}`;

  while (true) {
    console.clear();
    console.log(chalk.blue.bold(`\n📰 ${item.sourceName}`));
    console.log(chalk.gray(item.pubDate));
    console.log(chalk.cyan('='.repeat(50)));
    console.log(`\n${highlightDifficult(content)}\n`);
    console.log(chalk.cyan('='.repeat(50)));

    const words = (content.match(/\b[a-zA-Z]{3,}\b/g) || [])
      .filter(w => !commonWords.has(w.toLowerCase()) && !getVocabulary().some(v => v.word.toLowerCase() === w.toLowerCase()));
    const uniqueWords = [...new Set(words)].sort();

    if (uniqueWords.length > 0) {
      const show = uniqueWords.slice(0, 10);
      console.log(chalk.yellow(`\n📝 ${uniqueWords.length} palabras nuevas: `) + show.join(', ') +
        (uniqueWords.length > 10 ? chalk.dim(`... (+${uniqueWords.length - 10} más)`) : ''));
    } else {
      console.log(chalk.green('\n✅ No hay palabras nuevas en este artículo.\n'));
    }

    console.log(chalk.gray('\n  [n]ext article  [l]ookup  [v]ocab  [a]I vocab  [x]it\n'));

    const { cmd } = await inquirer.prompt([{
      type: 'input',
      name: 'cmd',
      message: '>',
      filter: (s: string) => s.trim().toLowerCase().slice(0, 1),
      validate: (s: string) => ['n','l','v','a','x'].includes(s.trim().toLowerCase().slice(0, 1))
        ? true : 'n/l/v/a/x?'
    }]);

    if (cmd === 'n' || cmd === 'x') break;

    if (cmd === 'l') {
      const { word } = await inquirer.prompt([{ type: 'input', name: 'word', message: '🔍 ' }]);
      if (!word.trim()) continue;
      const [trans] = await getBatchTranslations([word.trim()]);
      if (trans?.translation) {
        console.log(chalk.green(`\n  ${word.trim()} → ${trans.translation}`));
        const ctx = extractContext(content, word.trim());
        if (ctx) console.log(chalk.dim(`  "${ctx}"`));
        const { act } = await inquirer.prompt([{
          type: 'select', name: 'act', message: '¿Qué haces?',
          choices: [
            { name: '✅ Marcar como conocida', value: 'mark' },
            { name: '↩️  Volver', value: 'back' }
          ]
        }]);
        if (act === 'mark') {
          await markWordAsKnown(word.trim(), trans.translation, extractContext(content, word.trim()));
        }
      }
      await inquirer.prompt([{ type: 'input', name: '_', message: 'Enter...' }]);
    }

    if (cmd === 'v') {
      if (uniqueWords.length === 0) {
        console.log(chalk.yellow('No hay palabras nuevas.\n'));
        await inquirer.prompt([{ type: 'input', name: '_', message: 'Enter...' }]);
        continue;
      }
      console.log(chalk.blue('  Traduciendo...'));
      const transMap = new Map((await getBatchTranslations(uniqueWords.slice(0, 25))).map(t => [t.word.toLowerCase(), t.translation]));
      const { sel } = await inquirer.prompt([{
        type: 'checkbox', name: 'sel', message: 'Guardar:',
        choices: uniqueWords.slice(0, 25).map(w => ({
          name: `${w} ${chalk.dim('→')} ${transMap.get(w.toLowerCase()) || '?'}`,
          value: w, checked: true
        })),
        pageSize: 10,
      }]);
      let saved = 0;
      for (const w of sel) {
        const tr = transMap.get(w.toLowerCase());
        if (tr) { await saveWord({ word: w, translation: tr, context: extractContext(content, w) }); saved++; }
      }
      if (saved > 0) { console.log(chalk.green(`\n✔ ${saved} guardadas.`)); addXP(saved * 10); }
      await inquirer.prompt([{ type: 'input', name: '_', message: 'Enter...' }]);
    }

    if (cmd === 'a') {
      console.log(chalk.blue('\nIA seleccionando palabras...'));
      const aiWords = await getPodcastVocab(content.substring(0, 3000));
      if (aiWords.length === 0) { console.log(chalk.red('Error.\n')); await inquirer.prompt([{ type: 'input', name: '_', message: 'Enter...' }]); continue; }
      const { sel } = await inquirer.prompt([{
        type: 'checkbox', name: 'sel', message: 'IA recomienda:',
        choices: aiWords.map((w, i) => ({ name: `${chalk.yellow(w.word)}: ${w.translation}`, value: i })),
        default: aiWords.map((_, i) => i)
      }]);
      let saved = 0;
      for (const i of sel) {
        const { word, translation } = aiWords[i];
        await saveWord({ word, translation, context: extractContext(content, word) });
        saved++;
      }
      console.log(chalk.green(`\n✔ ${saved} guardadas.`));
      if (saved > 0) addXP(saved * 10);
      await inquirer.prompt([{ type: 'input', name: '_', message: 'Enter...' }]);
    }
  }
}

export async function newsReader() {
  console.log(chalk.cyan.bold('\n📰 News Reader\n'));

  const { category } = await inquirer.prompt([{
    type: 'select',
    name: 'category',
    message: 'Categoría:',
    choices: [
      ...CATEGORIES.map(c => ({ name: c.name, value: c })),
      { name: '↩️  Volver', value: 'back' }
    ]
  }]);

  if (category === 'back') return;

  const { source } = await inquirer.prompt([{
    type: 'select',
    name: 'source',
    message: 'Fuente:',
    choices: [
      ...category.sources.map((s: { name: string; url: string }) => ({ name: s.name, value: s })),
      { name: '↩️  Volver', value: 'back' }
    ]
  }]);

  if (source === 'back') return;

  console.log(chalk.blue('\nCargando noticias...'));
  const items = await fetchRSS(source.url);
  for (const item of items) item.sourceName = source.name;

  if (items.length === 0) {
    console.log(chalk.red('No se pudieron cargar noticias.\n'));
    await inquirer.prompt([{ type: 'input', name: '_', message: 'Enter...' }]);
    return;
  }

  let index = 0;
  while (index < items.length) {
    console.clear();
    const item = items[index];
    console.log(chalk.blue.bold(`\n📰 ${source.name}`));
    console.log(chalk.gray(`Item ${index + 1} de ${items.length} | ${item.pubDate || ''}`));
    console.log(chalk.cyan('='.repeat(50)));
    console.log(`\n${chalk.bold(item.title)}`);
    console.log(chalk.dim(`\n${item.description.substring(0, 300)}...`));
    console.log(chalk.cyan('\n' + '='.repeat(50)));

    const { act } = await inquirer.prompt([{
      type: 'select',
      name: 'act',
      message: '¿Qué haces?',
      choices: [
        { name: '📖  Leer artículo completo', value: 'read' },
        { name: '➡️  Siguiente noticia', value: 'next', disabled: index >= items.length - 1 },
        { name: '⬅️  Anterior', value: 'prev', disabled: index === 0 },
        { name: '↩️  Salir', value: 'exit' }
      ]
    }]);

    if (act === 'read') {
      await showArticleContent(item);
    } else if (act === 'next') {
      index++;
    } else if (act === 'prev') {
      index--;
    } else {
      break;
    }
  }
}
