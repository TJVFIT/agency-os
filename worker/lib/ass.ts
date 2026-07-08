/**
 * Karaoke ASS subtitle generator (SPEC §7.2) — pure, unit-tested.
 * 2–3 words per event, ≥64pt bold, white with a client-primary highlight via
 * `\k` tags, safe-area bottom third, PlayResY=1920. No IO here; the reel
 * pipeline writes the returned string to a .ass file and burns it in.
 */

export interface Word {
  /** Word text (already trimmed). */
  text: string;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
}

export interface AssOptions {
  /** Client primary color as #rrggbb; defaults to a warm gold. */
  primaryColor?: string;
  /** Words per subtitle event (SPEC: 2–3). */
  wordsPerEvent?: number;
  fontName?: string;
  fontSize?: number;
  playResX?: number;
  playResY?: number;
}

const DEFAULTS = {
  primaryColor: '#FFCC00',
  wordsPerEvent: 3,
  fontName: 'Noto Sans',
  fontSize: 72,
  playResX: 1080,
  playResY: 1920,
};

/** #rrggbb → ASS &HAABBGGRR& (alpha 00 = opaque, BGR order). */
export function hexToAssColor(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  const rgb = m ? m[1] : 'FFCC00';
  const r = rgb.slice(0, 2);
  const g = rgb.slice(2, 4);
  const b = rgb.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/** s (seconds) → ASS timestamp H:MM:SS.cc (centiseconds). */
export function formatAssTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const totalCs = Math.round(clamped * 100);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

/** Group a flat word list into events of `size` words (SPEC: 2–3). */
export function groupWords(words: Word[], size: number): Word[][] {
  const groups: Word[][] = [];
  for (let i = 0; i < words.length; i += size) {
    groups.push(words.slice(i, i + size));
  }
  return groups;
}

/**
 * Build a karaoke Dialogue line. Each word gets a `\k<centis>` tag equal to
 * its duration; the event spans the first word's start to the last word's end.
 */
export function buildKaraokeLine(group: Word[]): string {
  const start = group[0].start;
  const end = group[group.length - 1].end;
  let prevEnd = start;
  const text = group
    .map((w) => {
      // Gap before this word (e.g. silence) is absorbed into its \k duration.
      const durationCs = Math.max(1, Math.round((w.end - prevEnd) * 100));
      prevEnd = w.end;
      return `{\\k${durationCs}}${w.text}`;
    })
    .join(' ');
  return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(
    end,
  )},Karaoke,,0,0,0,,${text}`;
}

export function buildAssSubtitles(
  words: Word[],
  options: AssOptions = {},
): string {
  const opt = { ...DEFAULTS, ...options };
  const highlight = hexToAssColor(opt.primaryColor);
  const white = '&H00FFFFFF';
  // Safe area: bottom third. MarginV pushes the baseline up from the bottom.
  const marginV = Math.round(opt.playResY * 0.18);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${opt.playResX}`,
    `PlayResY: ${opt.playResY}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // PrimaryColour = fill after \k sweep (highlight), Secondary = pre-sweep (white).
    `Style: Karaoke,${opt.fontName},${opt.fontSize},${highlight},${white},&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = groupWords(words, opt.wordsPerEvent).map(buildKaraokeLine);
  return [...header, ...events].join('\n') + '\n';
}
