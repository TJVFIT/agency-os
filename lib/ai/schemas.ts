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

/** Assistant chat reply (v4 `chat` job kind, migration 0010). */
export const assistantResultSchema = z.object({
  reply: z.string().min(1),
});
export type AssistantResult = z.infer<typeof assistantResultSchema>;

/** Staff assistant reply for the dedicated open-model `chat` chain — pairs
 * with CHAT_SYSTEM's `Return ONLY JSON: {"reply":string}` contract. */
export const chatResultSchema = z.object({
  reply: z.string().min(1),
});
export type ChatResult = z.infer<typeof chatResultSchema>;

export const scenarioResultSchema = z.object({
  scenario: z.string(),
  shot_list: z.array(z.string()),
  copy_brief: z.string(),
  needs_shoot: z.boolean(),
  suggested_platforms: z.array(z.string()),
});
export type ScenarioResult = z.infer<typeof scenarioResultSchema>;

/**
 * edit_video LLM output (UPGRADE_SPEC §11a): a structured edit spec the
 * worker compiles into an FFmpeg filter graph. Times are seconds. `source`
 * indexes the job payload's asset list; overlay times refer to the FINAL
 * (post-trim, post-speed) timeline.
 */
export const videoEditSpecSchema = z.object({
  clips: z
    .array(
      z.object({
        source: z.number().int().min(0),
        start_s: z.number().min(0).nullable().default(null),
        end_s: z.number().min(0).nullable().default(null),
      }),
    )
    .min(1)
    .max(12),
  aspect: z.enum(['9:16', '1:1', '16:9']).default('9:16'),
  speed: z.number().min(0.5).max(2).default(1),
  mute: z.boolean().default(false),
  subtitles: z.boolean().default(false),
  overlays: z
    .array(
      z.object({
        text: z.string().min(1).max(80),
        start_s: z.number().min(0),
        end_s: z.number().min(0),
        position: z.enum(['top', 'center', 'bottom']).default('bottom'),
      }),
    )
    .max(8)
    .default([]),
  note: z.string().default(''),
});
export type VideoEditSpec = z.infer<typeof videoEditSpecSchema>;

/** edit_photo LLM output — compiled into a sharp pipeline by the worker. */
export const photoEditSpecSchema = z.object({
  crop: z.enum(['square', 'portrait', 'story', 'original']).default('original'),
  rotate: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .default(0),
  brightness: z.number().min(0.4).max(1.6).default(1),
  saturation: z.number().min(0).max(2).default(1),
  hue: z.number().int().min(-180).max(180).default(0),
  grayscale: z.boolean().default(false),
  sharpen: z.boolean().default(false),
  overlay_text: z.string().max(60).default(''),
  overlay_position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  format: z.enum(['jpeg', 'png']).default('jpeg'),
  note: z.string().default(''),
});
export type PhotoEditSpec = z.infer<typeof photoEditSpecSchema>;

export const RESULT_SCHEMAS = {
  caption: captionResultSchema,
  translate: translateResultSchema,
  reply: replyResultSchema,
  plan: plannerResultSchema,
  report: reportResultSchema,
} as const;

export type AiResultKind = keyof typeof RESULT_SCHEMAS;
