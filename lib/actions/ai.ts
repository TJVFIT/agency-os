'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * CLAUDE.md rule 3: ALL AI calls are queued. These actions only insert into
 * ai_jobs; the worker drains the queue and Realtime resolves the UI state.
 * Payload shapes are the contract with worker/src/handlers/* — change both.
 */

const captionPayload = z.object({
  card_id: z.uuid(),
  brief: z.string().max(2000).default(''),
  platform: z.string().default('instagram'),
});

const translatePayload = z.object({
  card_id: z.uuid(),
  src: z.enum(['tr', 'en']),
  tgt: z.enum(['tr', 'en']),
});

const replyPayload = z.object({
  card_id: z.uuid(),
  message: z.string().min(1).max(4000),
  context: z.string().max(2000).default(''),
});

// v2 creative kinds (UPGRADE_SPEC §4) — handled in worker/src/handlers/creative.ts.
const ideaRefinePayload = z.object({
  idea_id: z.uuid(),
});

const scenarioPayload = z.object({
  card_id: z.uuid(),
  brief: z.string().max(2000).default(''),
});

const posterPayload = z.object({
  card_id: z.uuid(),
  brief: z.string().max(2000).default(''),
});

const compliancePayload = z.object({
  card_id: z.uuid(),
});

// v3 edit kinds (UPGRADE_SPEC §11a) — handled in worker/src/handlers/edit.ts.
const editVideoPayload = z.object({
  client_id: z.uuid(),
  asset_ids: z.array(z.uuid()).min(1).max(4),
  prompt: z.string().min(1).max(1000),
});

const editPhotoPayload = z.object({
  client_id: z.uuid(),
  asset_id: z.uuid(),
  prompt: z.string().min(1).max(1000),
});

// v4 assistant chat (migration 0010) — handled in worker/src/handlers/chat.ts.
// Enqueue through lib/actions/assistant.ts sendAssistantMessage, which pins
// profile_id to the session user and inserts the message row first.
const chatPayload = z.object({
  profile_id: z.uuid(),
  message_id: z.uuid(),
});

const KIND_SCHEMAS = {
  caption: captionPayload,
  translate: translatePayload,
  reply: replyPayload,
  idea_refine: ideaRefinePayload,
  scenario: scenarioPayload,
  poster: posterPayload,
  compliance: compliancePayload,
  edit_video: editVideoPayload,
  edit_photo: editPhotoPayload,
  chat: chatPayload,
} as const;

export type EnqueueableKind = keyof typeof KIND_SCHEMAS;

export async function enqueueAiJob(
  kind: EnqueueableKind,
  payload: unknown,
): Promise<ActionResult<{ jobId: string }>> {
  const session = await requireSession();
  const schema = KIND_SCHEMAS[kind];
  if (!schema) return { ok: false, error: 'validation' };
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('ai_jobs')
    .insert({
      kind,
      payload: parsed.data,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { jobId: data.id } };
}
