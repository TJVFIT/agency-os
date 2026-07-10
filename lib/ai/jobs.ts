/**
 * Pure prompt assembly for queued AI jobs (SPEC §6). Given the card/client
 * context + payload, produce the rendered system prompt, a user turn, and the
 * result schema + provider chain kind. The worker does the DB IO around this;
 * keeping assembly pure makes it testable without a database.
 */

import {
  CAPTION_SYSTEM,
  IDEA_REFINE_SYSTEM,
  PLANNER_SYSTEM,
  POSTER_PROMPT,
  REPLY_SYSTEM,
  REPORT_SYSTEM,
  SCENARIO_SYSTEM,
  TRANSLATE_SYSTEM,
  renderPrompt,
} from './prompts';
import {
  captionResultSchema,
  ideaRefineResultSchema,
  plannerResultSchema,
  replyResultSchema,
  reportResultSchema,
  scenarioResultSchema,
  translateResultSchema,
} from './schemas';
import type { DraftingKind } from './providers';
import type { ZodType } from 'zod';

const USER_NUDGE = 'Return the JSON now.';

export interface BuiltPrompt<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Which provider chain to use (translate gets its own key group). */
  chainKind: DraftingKind | 'translate';
}

export interface BrandContext {
  brandProfileJson: string;
  hashtagBank: string[];
  bannedWords: string[];
  glossaryJson: string;
  langs: string[];
  platforms: string[];
}

export function buildCaptionPrompt(
  brand: Pick<BrandContext, 'brandProfileJson' | 'hashtagBank' | 'bannedWords'>,
  opts: { platform: string; brief: string; maxChars: number },
) {
  return {
    system: renderPrompt(CAPTION_SYSTEM, {
      brand_profile_json: brand.brandProfileJson,
      hashtag_bank: brand.hashtagBank.join(', '),
      banned_words: brand.bannedWords.join(', '),
      platform: opts.platform,
      brief: opts.brief,
      max_chars: opts.maxChars,
    }),
    user: USER_NUDGE,
    schema: captionResultSchema,
    chainKind: 'caption' as const,
  };
}

export function buildTranslatePrompt(
  glossaryJson: string,
  opts: { src: string; tgt: string; text: string },
) {
  return {
    system: renderPrompt(TRANSLATE_SYSTEM, {
      glossary_json: glossaryJson,
      src: opts.src,
      tgt: opts.tgt,
      text: opts.text,
    }),
    user: USER_NUDGE,
    schema: translateResultSchema,
    chainKind: 'translate' as const,
  };
}

export function buildReplyPrompt(
  brandProfileJson: string,
  opts: { message: string; context: string },
) {
  return {
    system: renderPrompt(REPLY_SYSTEM, {
      brand_profile_json: brandProfileJson,
      message: opts.message,
      context: opts.context,
    }),
    user: USER_NUDGE,
    schema: replyResultSchema,
    chainKind: 'reply' as const,
  };
}

export function buildPlannerPrompt(
  brandProfileJson: string,
  opts: {
    langs: string[];
    platforms: string[];
    topPostsJson: string;
    weekStart: string;
  },
) {
  return {
    system: renderPrompt(PLANNER_SYSTEM, {
      brand_profile_json: brandProfileJson,
      langs: opts.langs.join(', '),
      platforms: opts.platforms.join(', '),
      top_posts_json: opts.topPostsJson,
      week_start: opts.weekStart,
    }),
    user: USER_NUDGE,
    schema: plannerResultSchema,
    chainKind: 'plan' as const,
  };
}

export function buildReportPrompt(metricsJson: string) {
  return {
    system: renderPrompt(REPORT_SYSTEM, { metrics_json: metricsJson }),
    user: USER_NUDGE,
    schema: reportResultSchema,
    chainKind: 'report' as const,
  };
}

export function buildIdeaRefinePrompt(
  brandProfileJson: string,
  opts: { title: string; body: string },
) {
  return {
    system: renderPrompt(IDEA_REFINE_SYSTEM, {
      brand_profile_json: brandProfileJson,
      idea_title: opts.title,
      idea_body: opts.body,
    }),
    user: USER_NUDGE,
    schema: ideaRefineResultSchema,
    // Drafting-family chain (KEY_A) — 'plan' picks the same providers.
    chainKind: 'plan' as const,
  };
}

export function buildScenarioPrompt(
  brandProfileJson: string,
  opts: { brief: string; type: string },
) {
  return {
    system: renderPrompt(SCENARIO_SYSTEM, {
      brand_profile_json: brandProfileJson,
      type: opts.type,
      brief: opts.brief,
    }),
    user: USER_NUDGE,
    schema: scenarioResultSchema,
    chainKind: 'plan' as const,
  };
}

/** Rendered plain-text prompt for the poster image providers (UPGRADE_SPEC
 * §4). Image generation has no JSON contract, so no schema/chainKind here. */
export function buildPosterImagePrompt(
  brandProfileJson: string,
  brief: string,
): string {
  return renderPrompt(POSTER_PROMPT, {
    brand_profile_json: brandProfileJson,
    brief,
  });
}

/** Platform caption length caps (SPEC §6.3 max_chars). */
export const PLATFORM_MAX_CHARS: Record<string, number> = {
  instagram: 2200,
  facebook: 2200,
  tiktok: 2200,
  x: 280,
  youtube: 1000,
  linkedin: 3000,
};
