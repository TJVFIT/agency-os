'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { AUTOMATION_DOMAINS } from '@/lib/automation';
import { interpolate, tr } from '@/lib/i18n/tr';
import type { ActionResult } from '@/lib/actions/cards';
import type { Enums, Json, TablesInsert } from '@/lib/db/types';

/**
 * Automation modes + suggestions inbox actions (UPGRADE_SPEC §9).
 * - setAutomationMode: admin flips master/per-domain modes (trigger logs it).
 * - resolveSuggestion: manager/admin accepts (executes the structured body)
 *   or dismisses a worker-written suggestion row.
 */

const SETTING_KEYS = ['master', ...AUTOMATION_DOMAINS] as const;

const setModeSchema = z.object({
  key: z.enum(SETTING_KEYS),
  mode: z.enum(['suggest', 'semi', 'full']),
});

export async function setAutomationMode(
  input: z.input<typeof setModeSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin');
  const parsed = setModeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  // Session client on purpose: RLS admin_write_automation authorizes the
  // update and the DB trigger captures auth.uid() as the activity actor.
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('automation_settings')
    .update({
      mode: parsed.data.mode,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('key', parsed.data.key)
    .select('key');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'notFound' };

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Suggestion bodies — the exact execute-on-accept contract the worker writes.
// ---------------------------------------------------------------------------

const CARD_TYPES = ['post', 'reel', 'story', 'reply', 'other'] as const;

const JOB_KINDS = [
  'caption',
  'translate',
  'reply',
  'plan',
  'report',
  'image_variants',
  'bg_remove',
  'render_reel',
  'publish',
  'idea_refine',
  'scenario',
  'poster',
  'compliance',
] as const satisfies readonly Enums<'job_kind'>[];

const bodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('post_shoot_tasks'),
    shoot_id: z.uuid(),
    client_id: z.uuid(),
    shoot_title: z.string().min(1),
  }),
  z.object({
    kind: z.literal('create_cards'),
    client_id: z.uuid(),
    cards: z
      .array(
        z.object({
          title: z.string().min(1).max(200),
          type: z.enum(CARD_TYPES),
          brief: z.string().optional(),
        }),
      )
      .min(1),
  }),
  z.object({
    kind: z.literal('enqueue_job'),
    job: z.object({
      kind: z.enum(JOB_KINDS),
      payload: z.record(z.string(), z.unknown()).default({}),
    }),
  }),
  z.object({
    kind: z.literal('shoot_needed'),
    card_id: z.uuid(),
    client_id: z.uuid(),
  }),
  z.object({ kind: z.literal('info') }),
]);

type SuggestionBody = z.output<typeof bodySchema>;

const resolveSchema = z.object({
  id: z.uuid(),
  action: z.enum(['accept', 'dismiss']),
});

export async function resolveSuggestion(
  input: z.input<typeof resolveSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { id, action } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: suggestion, error: loadErr } = await supabase
    .from('suggestions')
    .select('*')
    .eq('id', id)
    .single();
  if (loadErr || !suggestion) return { ok: false, error: 'notFound' };
  if (suggestion.status !== 'pending')
    return { ok: false, error: 'validation' };

  if (action === 'dismiss') {
    // Session client: mgr_resolve_suggestions RLS + trigger logs auth.uid().
    const { data: claimed, error } = await supabase
      .from('suggestions')
      .update({
        status: 'dismissed',
        resolved_by: session.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending') // optimistic lock: no double resolution
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!claimed?.length) return { ok: false, error: 'validation' };

    revalidatePath('/dashboard');
    return { ok: true };
  }

  // accept: validate the structured body BEFORE claiming the row.
  const body = bodySchema.safeParse(suggestion.body);
  if (!body.success) return { ok: false, error: 'validation' };

  // Claim first (pending → accepted) so concurrent accepts can't execute the
  // body twice. On execution failure we revert to pending so a retry works.
  const { data: claimed, error: claimErr } = await supabase
    .from('suggestions')
    .update({
      status: 'accepted',
      resolved_by: session.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed?.length) return { ok: false, error: 'validation' };

  const execError = await executeBody(body.data, session.userId);
  if (execError) {
    await supabase
      .from('suggestions')
      .update({ status: 'pending', resolved_by: null, resolved_at: null })
      .eq('id', id);
    return { ok: false, error: execError };
  }

  revalidatePath('/dashboard');
  revalidatePath('/board');
  return { ok: true };
}

/** Execute an accepted suggestion body. Returns an error message or null. */
async function executeBody(
  body: SuggestionBody,
  actorId: string,
): Promise<string | null> {
  const admin = createSupabaseAdmin();

  switch (body.kind) {
    case 'post_shoot_tasks': {
      // The three kurgu/metin/kontrol cards (UPGRADE_SPEC §3/§9).
      const rows: TablesInsert<'cards'>[] = [
        tr.production.postShootTasks.edit,
        tr.production.postShootTasks.copy,
        tr.production.postShootTasks.review,
      ].map((template) => ({
        client_id: body.client_id,
        title: interpolate(template, { title: body.shoot_title }),
        type: 'other',
        status: 'idea',
        tags: ['post_shoot'],
        created_by: actorId,
      }));
      const { error: cardsErr } = await admin.from('cards').insert(rows);
      if (cardsErr) return cardsErr.message;

      const { error: shootErr } = await admin
        .from('shoots')
        .update({ tasks_opened: true })
        .eq('id', body.shoot_id);
      if (shootErr) return shootErr.message;

      // No trigger covers tasks_opened flips — log explicitly (hard rule 2).
      const { error: logErr } = await admin.from('activity_log').insert({
        actor: actorId,
        client_id: body.client_id,
        action: 'shoot.tasks_opened',
        detail: { shoot_id: body.shoot_id, title: body.shoot_title },
      });
      return logErr ? logErr.message : null;
    }

    case 'create_cards': {
      // brief has no card column — it stays readable on the suggestion body.
      const rows: TablesInsert<'cards'>[] = body.cards.map((card) => ({
        client_id: body.client_id,
        title: card.title,
        type: card.type,
        status: 'idea',
        tags: ['ai-planned'],
        created_by: actorId,
      }));
      const { error } = await admin.from('cards').insert(rows);
      return error ? error.message : null;
    }

    case 'enqueue_job': {
      const { error } = await admin.from('ai_jobs').insert({
        kind: body.job.kind,
        payload: (body.job.payload ?? {}) as Json,
        created_by: actorId,
      });
      return error ? error.message : null;
    }

    // Informational suggestions: accepting just archives them — the team
    // plans the actual shoot on /production.
    case 'shoot_needed':
    case 'info':
      return null;
  }
}
