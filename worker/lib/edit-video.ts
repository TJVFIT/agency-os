/**
 * edit_video spec → FFmpeg compiler (UPGRADE_SPEC §11a) — pure, unit-tested.
 * Stage 1 compiles trims / order / aspect / speed / audio policy into a
 * -filter_complex argument list; stage 2 (done by the handler) burns an ASS
 * file built by buildEditAss (karaoke words + text overlays). No IO here.
 */

import {
  buildKaraokeLine,
  formatAssTime,
  groupWords,
  hexToAssColor,
  type Word,
} from './ass';
import type { VideoEditSpec } from '../../lib/ai/schemas';

export interface EditSourceMeta {
  /** Local file path for the -i input. */
  path: string;
  durationS: number;
  hasAudio: boolean;
}

export interface CompiledEdit {
  /** Full ffmpeg argument list (without the leading binary name). */
  args: string[];
  /** Whether the output carries an audio track. */
  hasAudio: boolean;
  width: number;
  height: number;
  /** Estimated output duration in seconds (post-trim, post-speed). */
  durationS: number;
}

const RESOLUTIONS: Record<VideoEditSpec['aspect'], [number, number]> = {
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
};

export function editResolution(
  aspect: VideoEditSpec['aspect'],
): [number, number] {
  return RESOLUTIONS[aspect];
}

/** Clamp a clip's trim window to the source duration; null = full clip. */
function clipWindow(
  clip: VideoEditSpec['clips'][number],
  source: EditSourceMeta,
): { start: number; end: number } {
  const start = Math.min(clip.start_s ?? 0, Math.max(0, source.durationS));
  const end = Math.min(clip.end_s ?? source.durationS, source.durationS);
  return { start, end: Math.max(end, start) };
}

/**
 * Compile the spec into a single-pass ffmpeg invocation. Audio policy: the
 * output keeps audio only when the spec doesn't mute AND every clip's source
 * has an audio stream (concat requires uniform stream layouts — mixing silent
 * and sounded clips would need synthesized silence, out of v1 scope).
 */
export function compileVideoEdit(
  spec: VideoEditSpec,
  sources: EditSourceMeta[],
  outPath: string,
): CompiledEdit {
  for (const clip of spec.clips) {
    if (clip.source < 0 || clip.source >= sources.length) {
      throw new Error(`clip source ${clip.source} out of range`);
    }
  }

  const [width, height] = editResolution(spec.aspect);
  const speed = spec.speed;
  const withAudio = !spec.mute && spec.clips.every((c) => sources[c.source].hasAudio);

  // One -i per source file; clips may reference the same input repeatedly.
  const inputs = sources.flatMap((s) => ['-i', s.path]);

  const filters: string[] = [];
  const concatPads: string[] = [];
  let durationS = 0;
  spec.clips.forEach((clip, i) => {
    const src = sources[clip.source];
    const { start, end } = clipWindow(clip, src);
    durationS += end - start;
    const trim = clip.start_s === null && clip.end_s === null
      ? ''
      : `trim=start=${start}:end=${end},`;
    filters.push(
      `[${clip.source}:v]${trim}setpts=PTS-STARTPTS,` +
        `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},fps=30,format=yuv420p[v${i}]`,
    );
    concatPads.push(`[v${i}]`);
    if (withAudio) {
      const atrim = clip.start_s === null && clip.end_s === null
        ? ''
        : `atrim=start=${start}:end=${end},`;
      filters.push(
        `[${clip.source}:a]${atrim}asetpts=PTS-STARTPTS,` +
          `aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`,
      );
      concatPads[concatPads.length - 1] += `[a${i}]`;
    }
  });

  const n = spec.clips.length;
  const concatOut = withAudio ? '[vc][ac]' : '[vc]';
  filters.push(
    `${concatPads.join('')}concat=n=${n}:v=1:a=${withAudio ? 1 : 0}${concatOut}`,
  );

  let vOut = '[vc]';
  let aOut = withAudio ? '[ac]' : null;
  if (speed !== 1) {
    filters.push(`${vOut}setpts=PTS/${speed}[vs]`);
    vOut = '[vs]';
    if (aOut) {
      filters.push(`${aOut}atempo=${speed}[as]`);
      aOut = '[as]';
    }
    durationS /= speed;
  }

  const args = [
    '-y',
    ...inputs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    vOut,
    ...(aOut ? ['-map', aOut, '-c:a', 'aac', '-b:a', '128k'] : ['-an']),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-movflags',
    '+faststart',
    outPath,
  ];

  return { args, hasAudio: Boolean(aOut), width, height, durationS };
}

const OVERLAY_ALIGNMENT: Record<'top' | 'center' | 'bottom', number> = {
  top: 8,
  center: 5,
  bottom: 2,
};

/** {\...} braces and newlines would corrupt ASS event lines — strip them. */
function sanitizeAssText(text: string): string {
  return text.replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * One ASS document carrying both burn-in layers of an edit: karaoke speech
 * subtitles (same style as the reel pipeline) and the spec's text overlays.
 * Either list may be empty; with both empty the handler skips the burn pass.
 */
export function buildEditAss(opts: {
  words: Word[];
  overlays: VideoEditSpec['overlays'];
  width: number;
  height: number;
  primaryColor?: string;
}): string {
  const highlight = hexToAssColor(opts.primaryColor ?? '#FFCC00');
  const white = '&H00FFFFFF';
  const karaokeSize = Math.round(opts.height * 0.0375); // 72pt at 1920
  const overlaySize = Math.round(opts.height * 0.045);
  const marginV = Math.round(opts.height * 0.18);
  const overlayMarginV = Math.round(opts.height * 0.08);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${opts.width}`,
    `PlayResY: ${opts.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Karaoke,Noto Sans,${karaokeSize},${highlight},${white},&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,${marginV},1`,
    `Style: Overlay,Noto Sans,${overlaySize},${white},${white},&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,${overlayMarginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const karaoke = groupWords(opts.words, 3).map(buildKaraokeLine);
  const overlays = opts.overlays
    .filter((o) => o.end_s > o.start_s)
    .map((o) => {
      const align = OVERLAY_ALIGNMENT[o.position];
      return (
        `Dialogue: 1,${formatAssTime(o.start_s)},${formatAssTime(o.end_s)},` +
        `Overlay,,0,0,0,,{\\an${align}}${sanitizeAssText(o.text)}`
      );
    });

  return [...header, ...karaoke, ...overlays].join('\n') + '\n';
}
