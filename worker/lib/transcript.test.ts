import { describe, expect, it } from 'vitest';

import { parseTranscriptWords } from './transcript';

describe('parseTranscriptWords', () => {
  it('flattens segments into trimmed timed words', () => {
    const words = parseTranscriptWords({
      segments: [
        {
          words: [
            { word: ' merhaba', start: 0, end: 0.4 },
            { word: 'dünya ', start: 0.4, end: 0.9 },
          ],
        },
        { words: [{ word: 'nasılsın', start: 1.1, end: 1.6 }] },
      ],
    });
    expect(words).toEqual([
      { text: 'merhaba', start: 0, end: 0.4 },
      { text: 'dünya', start: 0.4, end: 0.9 },
      { text: 'nasılsın', start: 1.1, end: 1.6 },
    ]);
  });

  it('merges untimed words into the previous timed word (WhisperX aligner)', () => {
    const words = parseTranscriptWords({
      segments: [
        {
          words: [
            { word: 'saat', start: 0, end: 0.3 },
            { word: '19:00' }, // wav2vec2 cannot align digits — no timestamps
            { word: 'geliyoruz', start: 0.8, end: 1.4 },
          ],
        },
      ],
    });
    expect(words).toEqual([
      { text: 'saat 19:00', start: 0, end: 0.3 },
      { text: 'geliyoruz', start: 0.8, end: 1.4 },
    ]);
  });

  it('prefixes leading untimed words onto the first timed word', () => {
    const words = parseTranscriptWords({
      segments: [
        {
          words: [
            { word: '2026' },
            { word: 'yılında', start: 0.5, end: 1 },
          ],
        },
      ],
    });
    expect(words).toEqual([{ text: '2026 yılında', start: 0.5, end: 1 }]);
  });

  it('tolerates empty/missing structures', () => {
    expect(parseTranscriptWords(undefined)).toEqual([]);
    expect(parseTranscriptWords({})).toEqual([]);
    expect(
      parseTranscriptWords({ segments: [{ words: [{ word: '  ' }] }] }),
    ).toEqual([]);
  });
});
