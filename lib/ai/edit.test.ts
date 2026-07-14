import { describe, expect, it } from 'vitest';

import { buildPhotoEditPrompt, buildVideoEditPrompt } from './jobs';
import { EDIT_PHOTO_SYSTEM, EDIT_VIDEO_SYSTEM } from './prompts';
import { photoEditSpecSchema, videoEditSpecSchema } from './schemas';

describe('edit prompts', () => {
  it('pin their JSON contracts', () => {
    expect(EDIT_VIDEO_SYSTEM).toContain('Return ONLY JSON');
    expect(EDIT_PHOTO_SYSTEM).toContain('Return ONLY JSON');
  });

  it('buildVideoEditPrompt renders clips and request without leaks', () => {
    const built = buildVideoEditPrompt(
      [{ index: 0, duration_s: 12.5, has_audio: true }],
      'Baştaki 3 saniyeyi kes',
    );
    expect(built.system).toContain('"duration_s":12.5');
    expect(built.system).toContain('Baştaki 3 saniyeyi kes');
    expect(built.system).not.toMatch(/\{\w+\}$/m);
    expect(built.user).toBe('Return the JSON now.');
    expect(built.schema).toBe(videoEditSpecSchema);
    expect(built.chainKind).toBe('plan');
  });

  it('buildPhotoEditPrompt renders metadata and request', () => {
    const built = buildPhotoEditPrompt(
      { width: 4000, height: 3000 },
      'Karele ve parlaklığı artır',
    );
    expect(built.system).toContain('"width":4000');
    expect(built.system).toContain('Karele ve parlaklığı artır');
    expect(built.schema).toBe(photoEditSpecSchema);
    expect(built.chainKind).toBe('plan');
  });
});

describe('videoEditSpecSchema', () => {
  it('applies defaults on a minimal spec', () => {
    const spec = videoEditSpecSchema.parse({ clips: [{ source: 0 }] });
    expect(spec.aspect).toBe('9:16');
    expect(spec.speed).toBe(1);
    expect(spec.mute).toBe(false);
    expect(spec.subtitles).toBe(false);
    expect(spec.overlays).toEqual([]);
    expect(spec.clips[0]).toEqual({ source: 0, start_s: null, end_s: null });
  });

  it('rejects out-of-range values', () => {
    expect(
      videoEditSpecSchema.safeParse({ clips: [{ source: 0 }], speed: 3 })
        .success,
    ).toBe(false);
    expect(videoEditSpecSchema.safeParse({ clips: [] }).success).toBe(false);
    expect(
      videoEditSpecSchema.safeParse({
        clips: [{ source: 0 }],
        overlays: [{ text: 'x'.repeat(81), start_s: 0, end_s: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe('photoEditSpecSchema', () => {
  it('applies defaults on an empty spec', () => {
    const spec = photoEditSpecSchema.parse({});
    expect(spec.crop).toBe('original');
    expect(spec.rotate).toBe(0);
    expect(spec.brightness).toBe(1);
    expect(spec.format).toBe('jpeg');
    expect(spec.overlay_text).toBe('');
  });

  it('rejects non-90° rotations and extreme adjustments', () => {
    expect(photoEditSpecSchema.safeParse({ rotate: 45 }).success).toBe(false);
    expect(photoEditSpecSchema.safeParse({ brightness: 2.5 }).success).toBe(
      false,
    );
  });
});
