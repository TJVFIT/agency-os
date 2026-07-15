/**
 * Word-level transcription for the reel + edit_video pipelines.
 *
 * Engine: WhisperX by default (same faster-whisper backend we always used,
 * plus wav2vec2 forced alignment — Turkish model auto-selected via
 * --language). Falls back to the legacy faster-whisper-cli when the
 * whisperx binary is absent, so an un-migrated box keeps working. Set
 * TRANSCRIBE_ENGINE=faster-whisper to skip WhisperX explicitly.
 *
 * WhisperX writes its JSON to an output dir (no stdout mode) — we give it a
 * private temp dir and clean it in finally. Both engines emit the same
 * segments[].words[] shape, parsed by worker/lib/transcript.ts.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

import type { Word } from '../lib/ass';
import { parseTranscriptWords } from '../lib/transcript';
import { isMissingBinary, run } from './cli';
import { workerEnv } from './env';
import { log } from './log';

async function whisperxTranscribe(path: string): Promise<Word[]> {
  const env = workerEnv();
  const outDir = await mkdtemp(join(tmpdir(), 'whisperx-'));
  try {
    await run('whisperx', [
      path,
      '--model',
      env.WHISPER_MODEL,
      '--language',
      env.WHISPER_LANGUAGE,
      '--device',
      'cpu',
      '--compute_type',
      'int8',
      // Conservative batch for the shared 12 GB box (default is 8).
      '--batch_size',
      '4',
      '--output_format',
      'json',
      '--output_dir',
      outDir,
    ]);
    const jsonPath = join(outDir, `${basename(path, extname(path))}.json`);
    const raw = JSON.parse(await readFile(jsonPath, 'utf8')) as unknown;
    return parseTranscriptWords(raw);
  } finally {
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function fasterWhisperTranscribe(path: string): Promise<Word[]> {
  const env = workerEnv();
  const out = await run('faster-whisper-cli', [
    path,
    '--model',
    env.WHISPER_MODEL,
    '--word_timestamps',
    'True',
    '--output_format',
    'json',
  ]);
  return parseTranscriptWords(JSON.parse(out) as unknown);
}

/** Transcribe a media file to word-level timestamps (Turkish by default). */
export async function transcribe(path: string): Promise<Word[]> {
  const env = workerEnv();
  if (env.TRANSCRIBE_ENGINE === 'whisperx') {
    try {
      return await whisperxTranscribe(path);
    } catch (err) {
      if (!isMissingBinary(err)) throw err;
      log.warn(
        'whisperx binary not found — falling back to faster-whisper-cli',
      );
    }
  }
  return fasterWhisperTranscribe(path);
}
