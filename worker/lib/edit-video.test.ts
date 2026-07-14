import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { videoEditSpecSchema, type VideoEditSpec } from '../../lib/ai/schemas';
import {
  buildEditAss,
  compileVideoEdit,
  editResolution,
  type EditSourceMeta,
} from './edit-video';

const SRC: EditSourceMeta[] = [
  { path: '/tmp/a.mp4', durationS: 20, hasAudio: true },
  { path: '/tmp/b.mp4', durationS: 10, hasAudio: true },
];

function spec(
  partial: Partial<z.input<typeof videoEditSpecSchema>> = {},
): VideoEditSpec {
  return videoEditSpecSchema.parse({
    clips: [{ source: 0 }],
    ...partial,
  });
}

describe('editResolution', () => {
  it('maps aspects to render sizes', () => {
    expect(editResolution('9:16')).toEqual([1080, 1920]);
    expect(editResolution('1:1')).toEqual([1080, 1080]);
    expect(editResolution('16:9')).toEqual([1920, 1080]);
  });
});

describe('compileVideoEdit', () => {
  it('builds a single-input passthrough with audio', () => {
    const out = compileVideoEdit(spec(), SRC.slice(0, 1), '/tmp/out.mp4');
    expect(out.hasAudio).toBe(true);
    expect(out.width).toBe(1080);
    expect(out.height).toBe(1920);
    expect(out.durationS).toBe(20);
    expect(out.args).toContain('-filter_complex');
    const graph = out.args[out.args.indexOf('-filter_complex') + 1];
    // Untrimmed clip: no trim filter, but still normalized.
    expect(graph).not.toContain('trim=start');
    expect(graph).toContain('scale=1080:1920');
    expect(graph).toContain('concat=n=1:v=1:a=1');
    expect(out.args[out.args.length - 1]).toBe('/tmp/out.mp4');
  });

  it('trims, reorders and repeats clips across two sources', () => {
    const out = compileVideoEdit(
      spec({
        clips: [
          { source: 1, start_s: 2, end_s: 6 },
          { source: 0, start_s: null, end_s: 5 },
          { source: 1, start_s: 2, end_s: 6 },
        ],
      }),
      SRC,
      '/tmp/out.mp4',
    );
    // One -i per source file, not per clip.
    expect(out.args.filter((a) => a === '-i')).toHaveLength(2);
    const graph = out.args[out.args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('[1:v]trim=start=2:end=6');
    expect(graph).toContain('[0:v]trim=start=0:end=5');
    expect(graph).toContain('concat=n=3:v=1:a=1');
    expect(out.durationS).toBe(4 + 5 + 4);
  });

  it('clamps trim windows to the source duration', () => {
    const out = compileVideoEdit(
      spec({ clips: [{ source: 1, start_s: 8, end_s: 99 }] }),
      SRC,
      '/tmp/out.mp4',
    );
    const graph = out.args[out.args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('trim=start=8:end=10');
    expect(out.durationS).toBe(2);
  });

  it('applies speed to video, audio and the duration estimate', () => {
    const out = compileVideoEdit(
      spec({ speed: 2 }),
      SRC.slice(0, 1),
      '/tmp/out.mp4',
    );
    const graph = out.args[out.args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('setpts=PTS/2');
    expect(graph).toContain('atempo=2');
    expect(out.durationS).toBe(10);
  });

  it('drops audio when muted or when any source is silent', () => {
    const muted = compileVideoEdit(
      spec({ mute: true }),
      SRC.slice(0, 1),
      '/tmp/out.mp4',
    );
    expect(muted.hasAudio).toBe(false);
    expect(muted.args).toContain('-an');
    expect(
      muted.args[muted.args.indexOf('-filter_complex') + 1],
    ).toContain('concat=n=1:v=1:a=0');

    const silentSrc = [{ ...SRC[0], hasAudio: false }];
    const silent = compileVideoEdit(spec(), silentSrc, '/tmp/out.mp4');
    expect(silent.hasAudio).toBe(false);
  });

  it('rejects out-of-range clip sources', () => {
    expect(() =>
      compileVideoEdit(spec({ clips: [{ source: 5 }] }), SRC, '/tmp/out.mp4'),
    ).toThrow(/out of range/);
  });
});

describe('buildEditAss', () => {
  it('carries karaoke words and overlay events with both styles', () => {
    const ass = buildEditAss({
      words: [
        { text: 'merhaba', start: 0, end: 0.5 },
        { text: 'dünya', start: 0.5, end: 1 },
      ],
      overlays: [
        { text: 'Yeni menü!', start_s: 1, end_s: 3, position: 'top' },
      ],
      width: 1080,
      height: 1920,
      primaryColor: '#112233',
    });
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('Style: Karaoke');
    expect(ass).toContain('Style: Overlay');
    expect(ass).toContain('&H00332211'); // BGR of #112233
    expect(ass).toContain('{\\an8}Yeni menü!');
    expect(ass).toContain('{\\k'); // karaoke sweep tags
  });

  it('sanitizes ASS control characters and skips empty windows', () => {
    const ass = buildEditAss({
      words: [],
      overlays: [
        { text: 'a{\\b}c', start_s: 0, end_s: 2, position: 'bottom' },
        { text: 'gone', start_s: 3, end_s: 3, position: 'bottom' },
      ],
      width: 1080,
      height: 1080,
    });
    expect(ass).toContain('{\\an2}abc');
    expect(ass).not.toContain('gone');
  });
});
