import fs from 'fs';
import pathNode from 'path';
import crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';

const CACHE_DIR = './data/audio-cache/';
const EDGE_TTS_PATH = '/home/dat-pt74/.local/bin/edge-tts';
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George — British narrator
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';

// Estado global de reproducción (compartido con readerManager)
export let currentAudioProcess: ChildProcess | null = null;
export let audioPaused = false;

export function hasElevenLabsKey(): boolean {
    const key = process.env.ELEVENLABS_API_KEY;
    return !!key && key.length > 0 && key !== 'your_key_here';
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

/**
 * Genera audio para una oración, devuelve la ruta al MP3.
 * Usa ElevenLabs si hay API key, cae a edge-tts si no.
 */
export async function generateSentenceAudio(text: string, force: boolean = false): Promise<string> {
    ensureCacheDir();
    const cached = cachedPath(text);

    // Si ya está en caché, devolver directamente
    if (!force && fs.existsSync(cached)) {
        return cached;
    }

    const cleanText = text
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleanText) {
        throw new Error('Texto vacío para generar audio');
    }

    // Intentar ElevenLabs primero
    if (hasElevenLabsKey()) {
        try {
            console.log(chalk.dim('  🔊 ElevenLabs...'));
            const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
            const response = await fetch(`${ELEVENLABS_API}/${voiceId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': process.env.ELEVENLABS_API_KEY!,
                    'Accept': 'audio/mpeg',
                },
                body: JSON.stringify({
                    text: cleanText,
                    model_id: ELEVENLABS_MODEL,
                    voice_settings: {
                        stability: 0.35,
                        similarity_boost: 0.75,
                    },
                }),
            });

            if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                fs.writeFileSync(cached, buffer);
                return cached;
            }

            const errBody = await response.text().catch(() => '');
            console.log(chalk.yellow(`  ElevenLabs: ${response.status} — cayendo a edge-tts...`));
            if (errBody) console.log(chalk.dim(`  ${errBody.substring(0, 200)}`));
        } catch (e: any) {
            console.log(chalk.yellow(`  ElevenLabs error: ${e.message} — cayendo a edge-tts...`));
        }
    }

    // Fallback: edge-tts
    return generateEdgeTTS(cleanText, cached);
}

/**
 * Genera audio usando edge-tts y lo guarda en cachedPath.
 */
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

            // Mover al caché
            fs.renameSync(tempRaw, outPath);
            resolve(outPath);
        });

        tts.on('error', reject);
    });
}

/**
 * Reproduce un archivo MP3 con ffplay.
 * Devuelve función para detener.
 */
export function playAudioFile(filePath: string): () => void {
    // Detener audio previo
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
    if (!currentAudioProcess || !currentAudioProcess.pid) {
        return;
    }
    try {
        if (audioPaused) {
            process.kill(currentAudioProcess.pid, 'SIGCONT');
            audioPaused = false;
        } else {
            process.kill(currentAudioProcess.pid, 'SIGSTOP');
            audioPaused = true;
        }
    } catch {
        // ignore
    }
}

export async function preloadSentenceAudio(text: string): Promise<void> {
    try {
        const cached = cachedPath(text);
        if (fs.existsSync(cached)) return;
        // Generar en background sin esperar
        generateSentenceAudio(text).catch(() => {});
    } catch {
        // ignore
    }
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
        try {
            bytes += fs.statSync(pathNode.join(CACHE_DIR, f)).size;
        } catch {}
    }
    return { files: files.length, bytes };
}
