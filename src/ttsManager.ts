/**
 * TTS Manager — ElevenLabs SDK con fallback a edge-tts.
 *
 * Usa @elevenlabs/elevenlabs-js (SDK oficial) para generación de audio.
 * Cachea por hash MD5 del texto para evitar regenerar.
 * Fallback automático a edge-tts CLI si ElevenLabs falla.
 */

import fs from 'fs';
import pathNode from 'path';
import crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';

const CACHE_DIR = './data/audio-cache/';
const EDGE_TTS_PATH = '/home/dat-pt74/.local/bin/edge-tts';
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George

let elevenLabsClient: any = null;
let elevenLabsLoadAttempted = false;

export let currentAudioProcess: ChildProcess | null = null;
export let audioPaused = false;

export function hasElevenLabsKey(): boolean {
  const key = process.env.ELEVENLABS_API_KEY;
  return !!key && key.length > 0 && key !== 'your_key_here';
}

async function getClient() {
  if (!elevenLabsClient && hasElevenLabsKey() && !elevenLabsLoadAttempted) {
    elevenLabsLoadAttempted = true;
    try {
      const mod = await import('@elevenlabs/elevenlabs-js');
      elevenLabsClient = new mod.ElevenLabsClient();
    } catch (e: any) {
      console.error(chalk.red(`  Error cargando ElevenLabs SDK: ${e.message}`));
    }
  }
  return elevenLabsClient;
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function sentenceHash(text: string): string {
  return crypto.createHash('md5').update(text.trim().toLowerCase()).digest('hex');
}

function cachedPath(text: string): string {
  return pathNode.join(CACHE_DIR, `${sentenceHash(text)}.mp3`);
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Genera audio para una oración. Devuelve la ruta al MP3 cacheado.
 */
export async function generateSentenceAudio(text: string, force: boolean = false): Promise<string> {
  ensureCacheDir();
  const cached = cachedPath(text);

  if (!force && fs.existsSync(cached)) {
    return cached;
  }

  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!cleanText) throw new Error('Texto vacío');

  const client = await getClient();

  if (client) {
    try {
      console.log(chalk.dim('  🔊 ElevenLabs...'));
      const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

      const stream = await client.textToSpeech.convert(voiceId, {
        text: cleanText,
        modelId: 'eleven_flash_v2',
        outputFormat: 'mp3_44100_128',
      });

      // stream es un ReadableStream
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      fs.writeFileSync(cached, buffer);
      return cached;
    } catch (e: any) {
      console.log(chalk.yellow(`  ElevenLabs: ${e.message} — cayendo a edge-tts...`));
    }
  }

  // Fallback: edge-tts
  return generateEdgeTTS(cleanText, cached);
}

/**
 * Reproduce un archivo MP3 con ffplay.
 */
export function playAudioFile(filePath: string): () => void {
  stopAudio();

  const player = spawn('ffplay', [
    '-nodisp', '-autoexit', '-loglevel', 'quiet', filePath,
  ], { stdio: 'ignore' });

  currentAudioProcess = player;
  audioPaused = false;

  player.on('close', () => {
    currentAudioProcess = null;
    audioPaused = false;
  });

  return () => stopAudio();
}

export function stopAudio() {
  if (currentAudioProcess) {
    currentAudioProcess.kill();
    currentAudioProcess = null;
    audioPaused = false;
  }
}

export function togglePauseAudio() {
  if (!currentAudioProcess || !currentAudioProcess.pid) return;
  try {
    if (audioPaused) {
      process.kill(currentAudioProcess.pid, 'SIGCONT');
      audioPaused = false;
    } else {
      process.kill(currentAudioProcess.pid, 'SIGSTOP');
      audioPaused = true;
    }
  } catch { /* ignore */ }
}

/**
 * Precarga una oración en caché (fire-and-forget).
 */
export async function preloadSentenceAudio(text: string): Promise<void> {
  try {
    const cached = cachedPath(text);
    if (fs.existsSync(cached)) return;
    generateSentenceAudio(text).catch(() => {});
  } catch { /* ignore */ }
}

export function clearAudioCache() {
  if (fs.existsSync(CACHE_DIR)) {
    const files = fs.readdirSync(CACHE_DIR);
    for (const f of files) {
      fs.rmSync(pathNode.join(CACHE_DIR, f), { force: true });
    }
    console.log(chalk.green(`🗑️  Caché de audio limpiada (${files.length} archivos).`));
  }
}

export function getCacheSize(): { files: number; bytes: number } {
  if (!fs.existsSync(CACHE_DIR)) return { files: 0, bytes: 0 };
  const files = fs.readdirSync(CACHE_DIR);
  let bytes = 0;
  for (const f of files) {
    try { bytes += fs.statSync(pathNode.join(CACHE_DIR, f)).size; } catch {}
  }
  return { files: files.length, bytes };
}

// ─── edge-tts fallback ─────────────────────────────────────────────

function generateEdgeTTS(text: string, outPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const textFile = `/tmp/tts_text_${timestamp}.txt`;
    const tempRaw = `/tmp/tts_raw_${timestamp}.mp3`;

    fs.writeFileSync(textFile, text, 'utf8');

    const tts = spawn(EDGE_TTS_PATH, [
      '--voice', 'en-US-JennyNeural',
      '--rate=-15%',
      '--file', textFile,
      '--write-media', tempRaw,
    ]);

    let err = '';
    tts.stderr.on('data', (d) => { err += d.toString(); });

    tts.on('close', (code) => {
      fs.rmSync(textFile, { force: true });
      if (code !== 0 || !fs.existsSync(tempRaw)) {
        reject(new Error(`edge-tts failed (${code}): ${err}`));
        return;
      }
      fs.renameSync(tempRaw, outPath);
      resolve(outPath);
    });

    tts.on('error', reject);
  });
}
