'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import {
  computeImpactItems,
  type ImpactCard,
  type ImpactContext,
  type ImpactItem,
  type ImpactShoot,
  type ProposedChange,
} from '@/lib/impact';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * Change-impact actions (v4 §21, §9). `computeImpact` fetches the related
 * rows under the user's RLS and runs the pure engine in lib/impact.ts;
 * `applyImpact` re-computes server-side (never trusts client-supplied items)
 * and applies the selected updates sequentially through the same guarded
 * client. The primary change itself (the reschedule / the leave) is saved by
 * its own existing action — these actions only handle the linked follow-ups.
 */

const changeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('shoot_move'),
    shootId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
  }),
  z.object({
    kind: z.literal('card_reschedule'),
    cardId: z.uuid(),
    at: z.iso.datetime({ offset: true }),
    /**
     * Pre-move anchor captured by the client before the primary save. Needed
     * by applyImpact, which runs after rescheduleCard has already written
     * `at` into the row (a bare recompute would see delta 0 and apply
     * nothing). Verified against the stored row before any write.
     */
    from: z.iso.datetime({ offset: true }).optional(),
  }),
  z.object({
    kind: z.literal('leave'),
    profileId: z.uuid(),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  }),
]);

const SHOOT_COLS =
  'id, title, client_id, starts_at, ends_at, status, crew, vehicle_id, card_id';
const CARD_COLS = 'id, title, client_id, status, assignee, due_at, scheduled_at';

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) =>
    seen.has(r.id) ? false : (seen.add(r.id), true),
  );
}

/** Pre-fetch the rows the pure engine needs for this change (team RLS). */
async function fetchContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  change: ProposedChange,
): Promise<ImpactContext> {
  if (change.kind === 'shoot_move') {
    const { data: shoot } = await supabase
      .from('shoots')
      .select(SHOOT_COLS)
      .eq('id', change.shootId)
      .single();
    if (!shoot) return { shoots: [], cards: [] };

    const { data: clientCards } = await supabase
      .from('cards')
      .select(CARD_COLS)
      .eq('client_id', shoot.client_id)
      .not('status', 'in', '(published,archived)');

    let vehicleShoots: ImpactShoot[] = [];
    if (shoot.vehicle_id) {
      const { data } = await supabase
        .from('shoots')
        .select(SHOOT_COLS)
        .eq('vehicle_id', shoot.vehicle_id)
        .in('status', ['planned', 'confirmed']);
      vehicleShoots = data ?? [];
    }

    // The linked card may sit under another client — fetch it if missed.
    let linkedCard: ImpactCard[] = [];
    if (
      shoot.card_id &&
      !(clientCards ?? []).some((c) => c.id === shoot.card_id)
    ) {
      const { data } = await supabase
        .from('cards')
        .select(CARD_COLS)
        .eq('id', shoot.card_id)
        .single();
      if (data) linkedCard = [data];
    }

    return {
      shoots: dedupeById([shoot, ...vehicleShoots]),
      cards: [...(clientCards ?? []), ...linkedCard],
    };
  }

  if (change.kind === 'card_reschedule') {
    const { data: card } = await supabase
      .from('cards')
      .select(CARD_COLS)
      .eq('id', change.cardId)
      .single();
    if (!card) return { shoots: [], cards: [] };

    const [shootsRes, chainRes] = await Promise.all([
      supabase
        .from('shoots')
        .select(SHOOT_COLS)
        .eq('card_id', card.id)
        .in('status', ['planned', 'confirmed']),
      supabase
        .from('cards')
        .select(CARD_COLS)
        .eq('client_id', card.client_id)
        .eq('status', 'scheduled'),
    ]);

    return {
      shoots: shootsRes.data ?? [],
      cards: dedupeById([card, ...(chainRes.data ?? [])]),
    };
  }

  // leave
  const [shootsRes, cardsRes] = await Promise.all([
    supabase
      .from('shoots')
      .select(SHOOT_COLS)
      .contains('crew', [change.profileId])
      .in('status', ['planned', 'confirmed']),
    supabase
      .from('cards')
      .select(CARD_COLS)
      .eq('assignee', change.profileId)
      .not('due_at', 'is', null)
      .not('status', 'in', '(published,archived)'),
  ]);
  return { shoots: shootsRes.data ?? [], cards: cardsRes.data ?? [] };
}

/** What would this change touch? Pure analysis, no writes. */
export async function computeImpact(
  input: z.input<typeof changeSchema>,
): Promise<ActionResult<ImpactItem[]>> {
  await requireSession();
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (parsed.data.kind === 'leave' && parsed.data.endsOn < parsed.data.startsOn)
    return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const ctx = await fetchContext(supabase, parsed.data);
  return { ok: true, data: computeImpactItems(parsed.data, ctx) };
}

const applySchema = z.object({
  change: changeSchema,
  /** Ids of the impact items the user checked (cards.id / shoots.id). */
  selectedIds: z.array(z.uuid()).max(200),
});

/**
 * Apply the selected follow-up updates, transactionally-ish: sequential
 * updates through the guarded client, one activity entry with counts at the
 * end (rule 2 — no trigger captures the bulk-apply reason). Impact is
 * re-computed server-side; the client only chooses which ids to apply.
 * Route items are informational and never written. Publish dates only move
 * while the card is still `scheduled` and only into the future — the
 * dispatcher must never be handed a past date (rule 1 stays intact: status
 * is untouched here).
 */
export async function applyImpact(
  input: z.input<typeof applySchema>,
): Promise<ActionResult<{ applied: number }>> {
  const session = await requireSession();
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { change, selectedIds } = parsed.data;
  if (change.kind === 'leave' && change.endsOn < change.startsOn)
    return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const ctx = await fetchContext(supabase, change);

  // Never trust a client-supplied `from` blindly: the stored anchor must be
  // either `at` (the primary save already landed — the normal flow) or `from`
  // itself (save not yet visible). Anything else means the card moved
  // concurrently and the deltas the user approved no longer hold.
  if (change.kind === 'card_reschedule' && change.from) {
    const card = ctx.cards.find((c) => c.id === change.cardId);
    const anchor = card ? (card.scheduled_at ?? card.due_at) : null;
    const anchorMs = anchor ? new Date(anchor).getTime() : NaN;
    if (
      anchorMs !== new Date(change.at).getTime() &&
      anchorMs !== new Date(change.from).getTime()
    )
      return { ok: false, error: 'conflict' };
  }

  const items = computeImpactItems(change, ctx);

  const wanted = new Set(selectedIds);
  const toApply = items.filter(
    (i) => wanted.has(i.id) && i.kind !== 'route' && i.proposed !== i.current,
  );

  const counts = { card: 0, shoot: 0, publish: 0 };
  const skipped: string[] = [];

  for (const item of toApply) {
    if (item.kind === 'card') {
      const { error } = await supabase
        .from('cards')
        .update({ due_at: item.proposed })
        .eq('id', item.id);
      if (error) skipped.push(item.id);
      else counts.card += 1;
    } else if (item.kind === 'publish') {
      if (new Date(item.proposed) <= new Date()) {
        skipped.push(item.id); // a past scheduled_at would publish immediately
        continue;
      }
      const { data, error } = await supabase
        .from('cards')
        .update({ scheduled_at: item.proposed })
        .eq('id', item.id)
        .eq('status', 'scheduled') // optimistic lock: status moved on = skip
        .select('id');
      if (error || !data?.length) skipped.push(item.id);
      else counts.publish += 1;
    } else if (item.kind === 'shoot') {
      const shoot = ctx.shoots.find((s) => s.id === item.id);
      if (!shoot) {
        skipped.push(item.id);
        continue;
      }
      // Shift ends_at by the same delta so the block length is preserved.
      const delta =
        new Date(item.proposed).getTime() - new Date(shoot.starts_at).getTime();
      const endsAt = new Date(
        new Date(shoot.ends_at).getTime() + delta,
      ).toISOString();
      const { error } = await supabase
        .from('shoots')
        .update({ starts_at: item.proposed, ends_at: endsAt })
        .eq('id', item.id)
        .in('status', ['planned', 'confirmed']);
      if (error) skipped.push(item.id);
      else counts.shoot += 1;
    }
  }

  const applied = counts.card + counts.shoot + counts.publish;
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      action: 'impact.applied',
      detail: {
        change_kind: change.kind,
        counts,
        applied,
        selected: selectedIds.length,
        skipped_ids: skipped,
      },
    });

  revalidatePath('/calendar');
  revalidatePath('/production');
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true, data: { applied } };
}
