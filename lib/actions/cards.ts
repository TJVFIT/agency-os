'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { canTransition, type CardStatus } from '@/lib/status';
import { PLATFORMS } from '@/lib/db/types';

export type ActionResult<T = undefined> =
  { ok: true; data?: T } | { ok: false; error: string };

const createCardSchema = z.object({
  clientId: z.uuid(),
  title: z.string().min(1).max(200),
  type: z.enum(['post', 'reel', 'story', 'reply', 'other']).default('post'),
  assignee: z.uuid().nullish(),
  dueAt: z.iso.datetime({ offset: true }).nullish(),
  priority: z.number().int().min(1).max(5).default(3),
});

export async function createCard(
  input: z.input<typeof createCardSchema>,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = createCardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('cards')
    .insert({
      client_id: parsed.data.clientId,
      title: parsed.data.title,
      type: parsed.data.type,
      assignee: parsed.data.assignee ?? null,
      due_at: parsed.data.dueAt ?? null,
      priority: parsed.data.priority,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true, data: { id: data.id } };
}

const updateCardMetaSchema = z.object({
  cardId: z.uuid(),
  title: z.string().min(1).max(200).optional(),
  assignee: z.uuid().nullable().optional(),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  platforms: z.array(z.enum(PLATFORMS)).optional(),
  tags: z.array(z.string()).optional(),
});

export async function updateCardMeta(
  input: z.input<typeof updateCardMetaSchema>,
): Promise<ActionResult> {
  await requireSession();
  const parsed = updateCardMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { cardId, ...fields } = parsed.data;

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from('cards')
    .update({
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.assignee !== undefined && { assignee: fields.assignee }),
      ...(fields.dueAt !== undefined && { due_at: fields.dueAt }),
      ...(fields.priority !== undefined && { priority: fields.priority }),
      ...(fields.platforms !== undefined && { platforms: fields.platforms }),
      ...(fields.tags !== undefined && { tags: fields.tags }),
    })
    .eq('id', cardId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/board');
  revalidatePath(`/cards/${cardId}`);
  return { ok: true };
}

const transitionSchema = z.object({
  cardId: z.uuid(),
  to: z.enum([
    'idea',
    'copy_draft',
    'visual_ready',
    'translated',
    'approved',
    'scheduled',
    'published',
    'archived',
  ]),
  // Only used when entering `scheduled`:
  scheduledAt: z.iso.datetime({ offset: true }).nullish(),
  platforms: z.array(z.enum(PLATFORMS)).nullish(),
});

/**
 * The one gate for status changes from the UI. Validates with
 * lib/status.canTransition (the DB trigger is the backstop) and returns the
 * TransitionReason code on refusal — the UI maps it via tr.statusReasons.
 */
export async function transitionCardStatus(
  input: z.input<typeof transitionSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { cardId, to, scheduledAt, platforms } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: card, error: loadErr } = await supabase
    .from('cards')
    .select('id, status, platforms, scheduled_at, clients(langs)')
    .eq('id', cardId)
    .single();
  if (loadErr || !card) return { ok: false, error: 'cardNotFound' };

  const langs = (card.clients as { langs: string[] } | null)?.langs ?? ['tr'];
  const nextScheduledAt =
    scheduledAt !== undefined && scheduledAt !== null
      ? new Date(scheduledAt)
      : card.scheduled_at
        ? new Date(card.scheduled_at)
        : null;
  const nextPlatforms = platforms ?? card.platforms;

  const verdict = canTransition(session.role, card.status as CardStatus, to, {
    langs,
    scheduledAt: nextScheduledAt,
    platforms: nextPlatforms,
  });
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  const { error } = await supabase
    .from('cards')
    .update({
      status: to,
      ...(to === 'scheduled' && {
        scheduled_at: nextScheduledAt?.toISOString(),
        platforms: nextPlatforms,
      }),
    })
    .eq('id', cardId)
    .eq('status', card.status); // optimistic lock: no double transitions
  if (error) return { ok: false, error: error.message };

  revalidatePath('/board');
  revalidatePath('/calendar');
  revalidatePath(`/cards/${cardId}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

const rescheduleSchema = z.object({
  cardId: z.uuid(),
  /** ISO datetime; writes scheduled_at when status is scheduled, else due_at */
  at: z.iso.datetime({ offset: true }),
});

/** Calendar drag: SPEC §12 — updates scheduled_at or due_at by status. */
export async function rescheduleCard(
  input: z.input<typeof rescheduleSchema>,
): Promise<ActionResult> {
  await requireSession();
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data: card } = await supabase
    .from('cards')
    .select('id, status')
    .eq('id', parsed.data.cardId)
    .single();
  if (!card) return { ok: false, error: 'cardNotFound' };

  // A scheduled card's date drives the publish dispatcher, so it must stay in
  // the future — otherwise a drag to a past day would publish immediately.
  // (due_at, a soft deadline on non-scheduled cards, has no such constraint.)
  if (card.status === 'scheduled' && new Date(parsed.data.at) <= new Date())
    return { ok: false, error: 'schedule_requires_future_date' };

  const update =
    card.status === 'scheduled'
      ? { scheduled_at: parsed.data.at }
      : { due_at: parsed.data.at };
  const { error } = await supabase
    .from('cards')
    .update(update)
    .eq('id', card.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/calendar');
  return { ok: true };
}
