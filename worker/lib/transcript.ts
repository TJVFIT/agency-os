/**
 * Transcript JSON → Word[] (pure, unit-tested). Both engines emit the same
 * segments[].words[] shape ({word,start,end}), but WhisperX's wav2vec2
 * aligner leaves numbers/symbols it cannot align WITHOUT timestamps — those
 * words are merged into a timed neighbor instead of being dropped, so the
 * karaoke subtitles never lose spoken text or invent timings.
 */

import type { Word } from './ass';

interface RawWord {
  word?: string;
  start?: number;
  end?: number;
}

interface RawTranscript {
  segments?: Array<{ words?: RawWord[] }>;
}

export function parseTranscriptWords(raw: unknown): Word[] {
  const json = (raw ?? {}) as RawTranscript;
  const words: Word[] = [];
  let pendingPrefix = '';

  for (const segment of json.segments ?? []) {
    for (const w of segment.words ?? []) {
      const text = (w.word ?? '').trim();
      if (!text) continue;
      if (typeof w.start === 'number' && typeof w.end === 'number') {
        words.push({
          text: pendingPrefix ? `${pendingPrefix} ${text}` : text,
          start: w.start,
          end: w.end,
        });
        pendingPrefix = '';
      } else if (words.length > 0) {
        // Untimed word: ride along with the previous timed word.
        words[words.length - 1].text += ` ${text}`;
      } else {
        // Untimed before any timed word: prefix the first timed one.
        pendingPrefix = pendingPrefix ? `${pendingPrefix} ${text}` : text;
      }
    }
  }
  return words;
}
