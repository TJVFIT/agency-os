/**
 * Pre-publish uygunluk kontrolü (UPGRADE_SPEC §5, client req 29).
 * Pure + deterministic; the dispatcher runs it before creating a `publish`
 * job, the workroom can show it live. AI-assisted checks are a separate
 * optional `compliance` ai_job — this module is the always-on gate.
 */

export interface ComplianceInput {
  caption: string;
  hashtags: string[];
  mediaCount: number;
  platform: string;
  bannedWords: string[];
  scheduledAt: Date | null;
  now: Date;
}

export type ComplianceIssueCode =
  | 'caption_missing'
  | 'caption_too_long'
  | 'banned_word'
  | 'too_many_hashtags'
  | 'media_missing'
  | 'schedule_in_past';

export interface ComplianceIssue {
  code: ComplianceIssueCode;
  detail: string;
}

export interface ComplianceResult {
  ok: boolean;
  issues: ComplianceIssue[];
}

/** Platform caption hard limits (conservative, chars). */
export const PLATFORM_CAPTION_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 5000,
  tiktok: 2200,
  x: 280,
  youtube: 5000,
  linkedin: 3000,
};

export const PLATFORM_HASHTAG_LIMITS: Record<string, number> = {
  instagram: 30,
  facebook: 30,
  tiktok: 30,
  x: 10,
  youtube: 15,
  linkedin: 30,
};

const WORD_SPLIT = /[\s.,;:!?()[\]{}"'«»–—/\\|@#]+/;

export function checkCompliance(input: ComplianceInput): ComplianceResult {
  const issues: ComplianceIssue[] = [];
  const caption = input.caption.trim();

  if (!caption) {
    issues.push({ code: 'caption_missing', detail: input.platform });
  }

  const limit = PLATFORM_CAPTION_LIMITS[input.platform] ?? 2200;
  // hashtags are appended to the caption at publish time
  const appended = input.hashtags
    .map((h) => `#${h.replace(/^#/, '')}`)
    .join(' ');
  const fullLength = caption.length + (appended ? appended.length + 2 : 0);
  if (fullLength > limit) {
    issues.push({
      code: 'caption_too_long',
      detail: `${fullLength}/${limit} (${input.platform})`,
    });
  }

  if (input.bannedWords.length && caption) {
    const words = new Set(
      caption.toLocaleLowerCase('tr').split(WORD_SPLIT).filter(Boolean),
    );
    for (const banned of input.bannedWords) {
      const b = banned.toLocaleLowerCase('tr').trim();
      if (!b) continue;
      // single words match tokens; phrases match as substring
      const hit = b.includes(' ')
        ? caption.toLocaleLowerCase('tr').includes(b)
        : words.has(b);
      if (hit) issues.push({ code: 'banned_word', detail: banned });
    }
  }

  const hashtagLimit = PLATFORM_HASHTAG_LIMITS[input.platform] ?? 30;
  if (input.hashtags.length > hashtagLimit) {
    issues.push({
      code: 'too_many_hashtags',
      detail: `${input.hashtags.length}/${hashtagLimit} (${input.platform})`,
    });
  }

  if (input.mediaCount === 0) {
    issues.push({ code: 'media_missing', detail: input.platform });
  }

  if (input.scheduledAt && input.scheduledAt.getTime() <= input.now.getTime()) {
    issues.push({
      code: 'schedule_in_past',
      detail: input.scheduledAt.toISOString(),
    });
  }

  return { ok: issues.length === 0, issues };
}
