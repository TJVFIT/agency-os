'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { AUTOMATION_DOMAINS } from '@/lib/automation';
import { OPEN_CARD_STATUSES } from '@/lib/workload';
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
  // Workload rebalance transfer (v4): from = current assignee (null = the
  // unassigned pool) so the executor can detect a stale suggestion.
  z.object({
    kind: z.literal('reassign_card'),
    card_id: z.uuid(),
    to: z.uuid(),
    from: z.uuid().nullable(),
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

  // A 'publish' suggestion can go stale between when the dispatcher wrote it
  // (card due: scheduled + scheduled_at ≤ now) and when a manager accepts it:
  // the card may have been published, moved off 'scheduled', deleted, or
  // rescheduled to the future. Enqueuing publish then would publish the wrong
  // thing immediately (hard rule 1). Re-verify here; if stale, dismiss the
  // suggestion (a fresh one is re-created once the card is due again).
  if (body.data.kind === 'enqueue_job' && body.data.job.kind === 'publish') {
    if (await isPublishSuggestionStale(supabase, body.data.job.payload)) {
      await supabase
        .from('suggestions')
        .update({
          status: 'dismissed',
          resolved_by: session.userId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending');
      revalidatePath('/dashboard');
      return { ok: false, error: 'stale' };
    }
  }

  // A workload transfer goes stale the same way: the card may have been
  // deleted, moved past the open statuses (no remaining work to hand over),
  // or reassigned since the scan wrote the suggestion. Auto-dismiss instead
  // of moving a card out from under whoever picked it up meanwhile.
  if (body.data.kind === 'reassign_card') {
    if (await isReassignSuggestionStale(supabase, body.data)) {
      await supabase
        .from('suggestions')
        .update({
          status: 'dismissed',
          resolved_by: session.userId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending');
      revalidatePath('/dashboard');
      return { ok: false, error: 'stale' };
    }
  }

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

/**
 * A publish suggestion is stale unless its card still exists, is still in
 * 'scheduled', and is still due (scheduled_at set and not in the future). A
 * card rescheduled to the future must not be published now, and one already
 * off 'scheduled' has been handled elsewhere. Runs under the caller's RLS.
 */
async function isPublishSuggestionStale(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const cardId = typeof payload.card_id === 'string' ? payload.card_id : null;
  if (!cardId) return true;

  const { data: card } = await supabase
    .from('cards')
    .select('status, scheduled_at')
    .eq('id', cardId)
    .maybeSingle();
  if (!card) return true;
  if (card.status !== 'scheduled') return true;
  if (!card.scheduled_at) return true;
  return new Date(card.scheduled_at).getTime() > Date.now();
}

/**
 * A reassign_card suggestion is stale unless its card still exists, still
 * carries open work, and is still held by the assignee the suggestion was
 * computed against (`from`, null = unassigned pool). Runs under caller RLS.
 */
async function isReassignSuggestionStale(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  body: { card_id: string; from: string | null },
): Promise<boolean> {
  const { data: card } = await supabase
    .from('cards')
    .select('status, assignee')
    .eq('id', body.card_id)
    .maybeSingle();
  if (!card) return true;
  if (!(OPEN_CARD_STATUSES as readonly string[]).includes(card.status))
    return true;
  return (card.assignee ?? null) !== body.from;
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

    case 'reassign_card': {
      // Session client on purpose (unlike the admin-path siblings): cards RLS
      // authorizes the manager's update and the 0005 assignment trigger logs
      // the change with auth.uid() as actor (rule 2) + notifies the new
      // assignee. The `from` guard makes the update a no-op if the assignee
      // changed between the stale check above and this write.
      const supabase = await createSupabaseServer();
      let update = supabase
        .from('cards')
        .update({ assignee: body.to })
        .eq('id', body.card_id);
      update = body.from
        ? update.eq('assignee', body.from)
        : update.is('assignee', null);
      const { data, error } = await update.select('id');
      if (error) return error.message;
      return data?.length ? null : 'stale';
    }

    // Informational suggestions: accepting just archives them — the team
    // plans the actual shoot on /production.
    case 'shoot_needed':
    case 'info':
      return null;
  }
}
