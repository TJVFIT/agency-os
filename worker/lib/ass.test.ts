import { describe, expect, it } from 'vitest';

import {
  buildAssSubtitles,
  buildKaraokeLine,
  formatAssTime,
  groupWords,
  hexToAssColor,
  type Word,
} from './ass';

const words: Word[] = [
  { text: 'Merhaba', start: 0, end: 0.5 },
  { text: 'sıcak', start: 0.5, end: 1.0 },
  { text: 'kahve', start: 1.0, end: 1.6 },
  { text: 'içmeye', start: 1.6, end: 2.1 },
  { text: 'gel', start: 2.1, end: 2.5 },
];

describe('hexToAssColor', () => {
  it('converts #rrggbb to &H00BBGGRR', () => {
    expect(hexToAssColor('#FFCC00')).toBe('&H0000CCFF');
    expect(hexToAssColor('#000000')).toBe('&H00000000');
    expect(hexToAssColor('#123456')).toBe('&H00563412');
  });
  it('tolerates missing # and falls back on garbage', () => {
    expect(hexToAssColor('FFCC00')).toBe('&H0000CCFF');
    expect(hexToAssColor('nope')).toBe('&H0000CCFF');
  });
});

describe('formatAssTime', () => {
  it('formats H:MM:SS.cc', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00');
    expect(formatAssTime(1.6)).toBe('0:00:01.60');
    expect(formatAssTime(61.234)).toBe('0:01:01.23');
    expect(formatAssTime(3661.5)).toBe('1:01:01.50');
  });
  it('clamps negatives to zero', () => {
    expect(formatAssTime(-5)).toBe('0:00:00.00');
  });
});

describe('groupWords (2–3 words per event, SPEC §7.2)', () => {
  it('groups by the requested size', () => {
    expect(groupWords(words, 3)).toHaveLength(2); // 3 + 2
    expect(groupWords(words, 2)).toHaveLength(3); // 2 + 2 + 1
  });
  it('keeps original order and drops nothing', () => {
    const flat = groupWords(words, 3).flat();
    expect(flat.map((w) => w.text)).toEqual(words.map((w) => w.text));
  });
  it('handles an empty list', () => {
    expect(groupWords([], 3)).toEqual([]);
  });
});

describe('buildKaraokeLine', () => {
  it('spans first start to last end with per-word \\k tags', () => {
    const line = buildKaraokeLine(words.slice(0, 3));
    expect(line).toContain('Dialogue: 0,0:00:00.00,0:00:01.60,Karaoke');
    expect(line).toContain('{\\k50}Merhaba');
    expect(line).toContain('{\\k50}sıcak');
    expect(line).toContain('{\\k60}kahve');
  });
  it('\\k durations across a group sum to the group span (centiseconds)', () => {
    const group = words.slice(0, 3); // 0.0 → 1.6 = 160cs
    const line = buildKaraokeLine(group);
    const ks = [...line.matchAll(/\\k(\d+)/g)].map((m) => Number(m[1]));
    expect(ks.reduce((a, b) => a + b, 0)).toBe(160);
  });
  it('never emits a zero-duration \\k', () => {
    const zero: Word[] = [
      { text: 'a', start: 1, end: 1 },
      { text: 'b', start: 1, end: 1 },
    ];
    const line = buildKaraokeLine(zero);
    expect(line).not.toContain('\\k0}');
    expect(line).toContain('\\k1}');
  });
});

describe('buildAssSubtitles', () => {
  const ass = buildAssSubtitles(words, { primaryColor: '#FF0000' });

  it('emits a vertical-video header (PlayResY=1920)', () => {
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('[V4+ Styles]');
    expect(ass).toContain('[Events]');
  });
  it('uses ≥64pt bold and the client primary color', () => {
    expect(ass).toMatch(/Style: Karaoke,[^,]+,72,/); // fontSize 72 ≥ 64
    expect(ass).toContain('-1,0,0,0'); // Bold=-1
    expect(ass).toContain(hexToAssColor('#FF0000'));
  });
  it('produces one Dialogue per group', () => {
    const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(lines).toHaveLength(2);
  });
  it('ends with a trailing newline', () => {
    expect(ass.endsWith('\n')).toBe(true);
  });
});
