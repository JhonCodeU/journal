/**
 * Scraper for UVic Study Zone
 *
 * Extracts readings (text + questions + audio) from levels:
 *   200 (Upper Beginner), 330 (Lower Intermediate),
 *   410 (Intermediate), 490 (Upper Intermediate)
 *
 * Usage: npx tsx scripts/scrape-uvic.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const DATA_DIR = path.resolve(import.meta.dirname, '..', 'data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio-cache');
const OUTPUT_FILE = path.join(DATA_DIR, 'uvic-readings.json');

const LEVELS = [
  { level: '200', label: 'Upper Beginner (A1-A2)',      indexUrl: 'https://continuingstudies.uvic.ca/elc/studyzone/200/reading/' },
  { level: '330', label: 'Lower Intermediate (A2-B1)',  indexUrl: 'https://continuingstudies.uvic.ca/elc/studyzone/330/reading/' },
  { level: '410', label: 'Intermediate (B1-B2)',        indexUrl: 'https://continuingstudies.uvic.ca/elc/studyzone/410/reading/' },
  { level: '490', label: 'Upper Intermediate (B2-C1)',  indexUrl: 'https://continuingstudies.uvic.ca/elc/studyzone/490/reading/' },
];

function fetchUrl(url: string, redirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirects <= 0) return reject(new Error('Too many redirects'));
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        return resolve(fetchUrl(redirectUrl, redirects - 1));
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractReadingIds(html: string, level: string): string[] {
  const ids = new Set<string>();
  const regex = new RegExp(`/elc/studyzone/${level}/reading/([\\w-]+)`, 'g');
  let match;
  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    if (/^[a-z-]+1$/.test(id) || /^[a-z-]+$/.test(id)) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

function decodeHtml(str: string): string {
  // Decode named entities
  let s = str
    .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'")
    .replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '...');
  // Decode numeric entities (hex and decimal)
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  s = s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
  return s;
}

function extractReading(html: string, id: string, level: string): any {
  // Audio URL
  let audioUrl = '';
  const audioMatch = html.match(/https:\/\/continuingstudies\.uvic\.ca\/upload\/elc\/studyzone\/[^"']+\.mp3/g);
  if (audioMatch) audioUrl = audioMatch[0];

  // Title
  let title = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (h1Match) {
    title = h1Match[1].replace(/: Reading Comprehension$/, '').replace(/^\d+\s*/, '').trim();
  }
  title = decodeHtml(title);

  // Text content
  let text = '';
  // Find text between the last H3 (story title) and "Show all questions" or credits
  const headings = [...html.matchAll(/<h3[^>]*>.*?<\/h3>/g)];
  let startPos = 0;
  if (headings.length > 0) {
    const lastH3 = headings[headings.length - 1];
    startPos = lastH3.index! + lastH3[0].length;
  }
  let endPos = html.indexOf('Show all questions');
  if (endPos < 0) endPos = html.indexOf('Return to the topics');
  if (endPos < 0) endPos = html.indexOf('<p><strong>Credits');
  if (endPos > 0 && startPos > 0 && endPos > startPos) {
    let raw = html.substring(startPos, endPos);
    raw = raw.replace(/<[^>]+>/g, '');
    raw = raw.replace(/!\[.*?\]\(.*?\)/g, '');
    raw = decodeHtml(raw);
    raw = raw.replace(/\n{4,}/g, '\n\n').trim();
    text = raw;
  }

  // Questions — parse QuizQuestions section
  const questions: any[] = [];
  const qsPos = html.lastIndexOf('<ol class="QuizQuestions"');
  if (qsPos >= 0) {
    // Each question is: <li class="QuizQuestion" id="Q_N"> ... </li>
    // We need to find each outer LI, tracking nesting
    let scanPos = qsPos;
    while (true) {
      const liStart = html.indexOf('<li class="QuizQuestion"', scanPos);
      if (liStart < 0) break;

      // Navigate through the item counting <li> and </li> depth
      // to find the matching closing </li>
      let liDepth = 0;
      let foundClose = -1;
      let i = liStart + '<li class="QuizQuestion"'.length;
      while (i < html.length) {
        const nextOpenLi = html.indexOf('<li', i);
        const nextCloseLi = html.indexOf('</li>', i);
        if (nextCloseLi < 0) break;
        if (nextOpenLi >= 0 && nextOpenLi < nextCloseLi) {
          liDepth++;
          i = nextOpenLi + 4;
        } else {
          if (liDepth <= 0) { foundClose = nextCloseLi; break; }
          liDepth--;
          i = nextCloseLi + 5;
        }
      }

      if (foundClose < 0) { scanPos = liStart + 1; continue; }

      const item = html.substring(liStart, foundClose + 5);

      // Extract question text
      const qtMatch = item.match(/<div class="QuestionText">([\s\S]*?)<\/div>/);
      if (!qtMatch) { scanPos = foundClose + 5; continue; }
      const question = decodeHtml(qtMatch[1].replace(/<[^>]+>/g, '').trim());

      // Extract MCAnswers
      const mcMatch = item.match(/<ol class="MCAnswers">([\s\S]*?)<\/ol>/);
      if (!mcMatch) { scanPos = foundClose + 5; continue; }

      const options: string[] = [];
      // Parse individual option LIs inside MCAnswers
      const optLines = mcMatch[1].match(/<li[^>]*>[\s\S]*?<\/li>/g) || [];
      for (const opt of optLines) {
        const txt = decodeHtml(opt
          .replace(/<button[^>]*>[\s\S]*?<\/button>/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim());
        if (txt) options.push(txt);
      }

      if (question && options.length >= 2) {
        questions.push({ question, options, correct: 0 });
      }

      scanPos = foundClose + 5;
    }
  }

  return { id, title, level, text, audioUrl, questions };
}

function downloadFile(url: string, dest: string, redirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects <= 0) return reject(new Error('Too many redirects'));
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        const redirectUrl = new URL(response.headers.location, url).href;
        return resolve(downloadFile(redirectUrl, dest, redirects - 1));
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('🧹 UVic Study Zone Scraper\n');
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const allReadings: any[] = [];

  for (const lvl of LEVELS) {
    console.log(`\n📖 Level ${lvl.level} — ${lvl.label}`);
    console.log('   Fetching index...');

    try {
      const html = await fetchUrl(lvl.indexUrl);
      const ids = extractReadingIds(html, lvl.level);
      console.log(`   Found ${ids.length} readings`);

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        process.stdout.write(`   [${i + 1}/${ids.length}] ${id}... `);

        try {
          const pageHtml = await fetchUrl(`${lvl.indexUrl}${id}`);
          const reading = extractReading(pageHtml, id, lvl.level);

          if (reading.audioUrl) {
            const ext = path.extname(reading.audioUrl) || '.mp3';
            const audioPath = path.join(AUDIO_DIR, `${id}${ext}`);
            if (!fs.existsSync(audioPath)) {
              try {
                await downloadFile(reading.audioUrl, audioPath);
                process.stdout.write('✔ audio ');
              } catch {
                process.stdout.write('⚠ no audio ');
              }
            } else {
              process.stdout.write('✔ cached ');
            }
          }

          if (reading.questions.length === 0) {
            process.stdout.write('⚠ no questions — skipping\n');
          } else {
            process.stdout.write(`✔ ${reading.questions.length}q\n`);
            allReadings.push(reading);
          }
        } catch (err: any) {
          process.stdout.write(`✘ ${err.message}\n`);
        }
      }
    } catch (err: any) {
      console.log(`   ✘ ${err.message}`);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allReadings, null, 2));
  console.log(`\n✅ ${allReadings.length} readings saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
