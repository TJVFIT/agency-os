/**
 * Zod schemas for LLM JSON outputs (SPEC §6.3). The router validates every
 * response against these and retries once on parse failure before failing
 * the job. Keep in lockstep with the "Return ONLY JSON: …" line of each prompt.
 */

import { z } from 'zod';

export const captionResultSchema = z.object({
  variants: z
    .array(
      z.object({
        caption: z.string(),
        hashtags: z.array(z.string()),
      }),
    )
    .min(1),
});
export type CaptionResult = z.infer<typeof captionResultSchema>;

export const translateResultSchema = z.object({
  translation: z.string(),
  notes: z.string(),
});
export type TranslateResult = z.infer<typeof translateResultSchema>;

export const replyResultSchema = z.object({
  reply: z.string(),
  escalate: z.boolean(),
  escalate_reason: z.string(),
});
export type ReplyResult = z.infer<typeof replyResultSchema>;

export const plannerResultSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string(),
        type: z.enum(['post', 'reel', 'story']),
        brief: z.string(),
        suggested_day: z.enum([
          'Mon',
          'Tue',
          'Wed',
          'Thu',
          'Fri',
          'Sat',
          'Sun',
        ]),
      }),
    )
    .min(1),
});
export type PlannerResult = z.infer<typeof plannerResultSchema>;

export const reportResultSchema = z.object({
  body_md: z.string(),
});
export type ReportResult = z.infer<typeof reportResultSchema>;

export const ideaRefineResultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  goal: z.string(),
  suggested_type: z.enum(['post', 'reel', 'story']),
});
export type IdeaRefineResult = z.infer<typeof ideaRefineResultSchema>;

export const scenarioResultSchema = z.object({
  scenario: z.string(),
  shot_list: z.array(z.string()),
  copy_brief: z.string(),
  needs_shoot: z.boolean(),
  suggested_platforms: z.array(z.string()),
});
export type ScenarioResult = z.infer<typeof scenarioResultSchema>;

export const RESULT_SCHEMAS = {
  caption: captionResultSchema,
  translate: translateResultSchema,
  reply: replyResultSchema,
  plan: plannerResultSchema,
  report: reportResultSchema,
} as const;

export type AiResultKind = keyof typeof RESULT_SCHEMAS;
