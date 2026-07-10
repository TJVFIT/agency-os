import { describe, expect, it } from 'vitest';

import {
  PLATFORM_CAPTION_LIMITS,
  PLATFORM_HASHTAG_LIMITS,
  checkCompliance,
  type ComplianceInput,
} from './compliance';

const NOW = new Date('2026-07-10T12:00:00Z');
const FUTURE = new Date('2026-07-15T09:00:00Z');

/** Baseline input that passes every check — tests override one axis each. */
function valid(overrides: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    caption: 'Yeni menümüz yayında, bekleriz!',
    hashtags: ['ankara', 'lezzet'],
    mediaCount: 1,
    platform: 'instagram',
    bannedWords: [],
    scheduledAt: FUTURE,
    now: NOW,
    ...overrides,
  };
}

function codes(input: ComplianceInput): string[] {
  return checkCompliance(input).issues.map((i) => i.code);
}

describe('checkCompliance — happy path', () => {
  it('passes a clean card', () => {
    const res = checkCompliance(valid());
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
  });

  it('passes with a null scheduledAt (dispatcher context)', () => {
    expect(checkCompliance(valid({ scheduledAt: null })).ok).toBe(true);
  });
});

describe('caption_missing', () => {
  it('flags an empty caption', () => {
    expect(codes(valid({ caption: '' }))).toContain('caption_missing');
  });

  it('flags a whitespace-only caption', () => {
    expect(codes(valid({ caption: '   \n\t ' }))).toContain('caption_missing');
  });

  it('skips the banned-word scan when the caption is empty', () => {
    const res = checkCompliance(
      valid({ caption: '', bannedWords: ['bedava'] }),
    );
    expect(res.issues.map((i) => i.code)).not.toContain('banned_word');
  });
});

describe('caption_too_long', () => {
  it('respects the per-platform limit (x = 280)', () => {
    expect(
      codes(valid({ platform: 'x', caption: 'a'.repeat(281), hashtags: [] })),
    ).toContain('caption_too_long');
    expect(
      codes(valid({ platform: 'x', caption: 'a'.repeat(280), hashtags: [] })),
    ).not.toContain('caption_too_long');
  });

  it('counts appended hashtags plus the two-char separator', () => {
    // 275 + 2 ("\n\n" equivalent) + "#ab #cd" (7) = 284 > 280
    expect(
      codes(
        valid({
          platform: 'x',
          caption: 'a'.repeat(275),
          hashtags: ['ab', 'cd'],
        }),
      ),
    ).toContain('caption_too_long');
    // 270 + 2 + 7 = 279 <= 280
    expect(
      codes(
        valid({
          platform: 'x',
          caption: 'a'.repeat(270),
          hashtags: ['ab', 'cd'],
        }),
      ),
    ).not.toContain('caption_too_long');
  });

  it('does not double the # prefix when hashtags already carry one', () => {
    // 271 + 2 + "#tag" (4) = 277 <= 280; a doubled '##tag' would make 278 — still
    // fine, so pin the exact boundary: 274 + 2 + 4 = 280 passes, 275 fails.
    expect(
      codes(
        valid({ platform: 'x', caption: 'a'.repeat(274), hashtags: ['#tag'] }),
      ),
    ).not.toContain('caption_too_long');
    expect(
      codes(
        valid({ platform: 'x', caption: 'a'.repeat(275), hashtags: ['#tag'] }),
      ),
    ).toContain('caption_too_long');
  });

  it('falls back to 2200 for unknown platforms', () => {
    expect(
      codes(
        valid({
          platform: 'mastodon',
          caption: 'a'.repeat(2201),
          hashtags: [],
        }),
      ),
    ).toContain('caption_too_long');
    expect(
      codes(
        valid({
          platform: 'mastodon',
          caption: 'a'.repeat(2200),
          hashtags: [],
        }),
      ),
    ).not.toContain('caption_too_long');
  });

  it('exposes limits for every supported platform', () => {
    for (const p of [
      'instagram',
      'facebook',
      'tiktok',
      'x',
      'youtube',
      'linkedin',
    ]) {
      expect(PLATFORM_CAPTION_LIMITS[p]).toBeGreaterThan(0);
      expect(PLATFORM_HASHTAG_LIMITS[p]).toBeGreaterThan(0);
    }
  });
});

describe('banned_word — tokenization', () => {
  it('matches a banned word as a whole token', () => {
    const res = checkCompliance(
      valid({ caption: 'Bugün bedava çay var', bannedWords: ['bedava'] }),
    );
    expect(res.issues).toContainEqual({
      code: 'banned_word',
      detail: 'bedava',
    });
  });

  it('does NOT match a banned word inside a longer token', () => {
    // 'kredi' is a substring of 'akreditasyon' but not a token of it
    expect(
      codes(
        valid({
          caption: 'akreditasyon belgesi alındı',
          bannedWords: ['kredi'],
        }),
      ),
    ).not.toContain('banned_word');
  });

  it('tokenizes across punctuation, hashtags and mentions', () => {
    expect(
      codes(
        valid({
          caption: 'Fırsat! #bedava, hemen gel',
          bannedWords: ['bedava'],
        }),
      ),
    ).toContain('banned_word');
    expect(
      codes(
        valid({ caption: 'sponsor:@bedava(hemen)', bannedWords: ['bedava'] }),
      ),
    ).toContain('banned_word');
  });

  it('compares case-insensitively with the Turkish locale (İ → i)', () => {
    expect(
      codes(
        valid({ caption: 'BÜYÜK İNDİRİM BAŞLADI', bannedWords: ['indirim'] }),
      ),
    ).toContain('banned_word');
  });

  it('matches multi-word banned phrases as substrings', () => {
    expect(
      codes(
        valid({
          caption: 'Bu hafta Bedava Kampanya sürprizi!',
          bannedWords: ['bedava kampanya'],
        }),
      ),
    ).toContain('banned_word');
    expect(
      codes(
        valid({
          caption: 'Bedava çay, kampanya yok',
          bannedWords: ['bedava kampanya'],
        }),
      ),
    ).not.toContain('banned_word');
  });

  it('ignores empty/whitespace banned entries', () => {
    expect(
      codes(valid({ caption: 'normal metin', bannedWords: ['', '   '] })),
    ).not.toContain('banned_word');
  });

  it('reports one issue per banned word hit', () => {
    const res = checkCompliance(
      valid({
        caption: 'bedava indirim günü',
        bannedWords: ['bedava', 'indirim'],
      }),
    );
    expect(res.issues.filter((i) => i.code === 'banned_word')).toHaveLength(2);
  });
});

describe('too_many_hashtags', () => {
  it('applies the per-platform hashtag limit (x = 10)', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(codes(valid({ platform: 'x', hashtags: eleven }))).toContain(
      'too_many_hashtags',
    );
    expect(
      codes(valid({ platform: 'x', hashtags: eleven.slice(0, 10) })),
    ).not.toContain('too_many_hashtags');
  });

  it('defaults to 30 for unknown platforms', () => {
    const thirtyOne = Array.from({ length: 31 }, (_, i) => `t${i}`);
    expect(
      codes(valid({ platform: 'mastodon', hashtags: thirtyOne })),
    ).toContain('too_many_hashtags');
  });
});

describe('media_missing', () => {
  it('flags zero attached media', () => {
    expect(codes(valid({ mediaCount: 0 }))).toContain('media_missing');
  });

  it('passes with at least one asset', () => {
    expect(codes(valid({ mediaCount: 1 }))).not.toContain('media_missing');
  });
});

describe('schedule_in_past', () => {
  it('flags a scheduled time in the past', () => {
    expect(
      codes(valid({ scheduledAt: new Date('2026-07-10T11:59:00Z') })),
    ).toContain('schedule_in_past');
  });

  it('flags a scheduled time exactly at now', () => {
    expect(codes(valid({ scheduledAt: new Date(NOW) }))).toContain(
      'schedule_in_past',
    );
  });

  it('passes a future scheduled time and skips null', () => {
    expect(codes(valid({ scheduledAt: FUTURE }))).not.toContain(
      'schedule_in_past',
    );
    expect(codes(valid({ scheduledAt: null }))).not.toContain(
      'schedule_in_past',
    );
  });
});

describe('issue accumulation', () => {
  it('collects every failing check in one pass', () => {
    const res = checkCompliance(
      valid({
        caption: '',
        hashtags: Array.from({ length: 31 }, (_, i) => `t${i}`),
        mediaCount: 0,
        scheduledAt: new Date('2026-07-01T00:00:00Z'),
      }),
    );
    expect(res.ok).toBe(false);
    const got = res.issues.map((i) => i.code);
    expect(got).toContain('caption_missing');
    expect(got).toContain('too_many_hashtags');
    expect(got).toContain('media_missing');
    expect(got).toContain('schedule_in_past');
  });
});
