'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  OPEN_CARD_STATUSES,
  WORKLOAD_HORIZON_DAYS,
  computeWorkload,
  suggestTransfers,
  transferTitle,
  type WorkloadCardInput,
} from '@/lib/workload';
import type { ActionResult } from '@/lib/actions/cards';
import type { Json } from '@/lib/db/types';

const DAY_MS = 864e5;

/**
 * Manager quick action "İş yükünü yeniden dağıt" (v4, suggestion-first):
 * recompute workloads from live rows with the pure lib/workload engine and
 * write the ranked transfers into the suggestions inbox (domain 'workload').
 * Nothing is reassigned here — a manager accepts each suggestion, and
 * lib/actions/automation.ts executes the reassign_card body under RLS.
 * Returns how many new suggestions were created (pending ones dedupe).
 */
export async function rebalanceWorkload(): Promise<
  ActionResult<{ created: number }>
> {
  const session = await requireRole('admin', 'manager');

  // Reads run on the session client (team-read RLS covers all four tables).
  const supabase = await createSupabaseServer();
  const now = Date.now();
  const horizonIso = new Date(now + WORKLOAD_HORIZON_DAYS * DAY_MS)
    .toISOString();

  const [profilesRes, cardsRes, typesRes, shootsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name'),
    supabase
      .from('cards')
      .select('id, title, client_id, assignee, status, due_at, task_type_id')
      .in('status', [...OPEN_CARD_STATUSES]),
    supabase.from('task_types').select('id, workload_points'),
    supabase
      .from('shoots')
      .select('crew')
      .in('status', ['planned', 'confirmed'])
      .gte('starts_at', new Date(now).toISOString())
      .lte('starts_at', horizonIso),
  ]);
  const loadError =
    profilesRes.error ?? cardsRes.error ?? typesRes.error ?? shootsRes.error;
  if (loadError) return { ok: false, error: loadError.message };

  const profiles = profilesRes.data ?? [];
  const cards = cardsRes.data ?? [];
  const cardInputs: WorkloadCardInput[] = cards.map((c) => ({
    id: c.id,
    title: c.title,
    assignee: c.assignee,
    status: c.status,
    dueAt: c.due_at,
    taskTypeId: c.task_type_id,
  }));
  const taskTypePoints = Object.fromEntries(
    (typesRes.data ?? []).map((t) => [t.id, t.workload_points]),
  );

  const workloads = computeWorkload(
    profiles.map((p) => ({ id: p.id, name: p.full_name })),
    cardInputs,
    (shootsRes.data ?? []).map((s) => s.crew ?? []),
    taskTypePoints,
  );
  const transfers = suggestTransfers(workloads, cardInputs, taskTypePoints);

  // Inserts need the service role: suggestions RLS only lets managers
  // *resolve* rows, creation is reserved to trusted server code (0006).
  const admin = createSupabaseAdmin();
  const names = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
  const clientByCard = Object.fromEntries(
    cards.map((c) => [c.id, c.client_id]),
  );

  let created = 0;
  for (const transfer of transfers) {
    // Dedupe: any pending workload suggestion for the card blocks a rerun
    // from stacking near-duplicates (same key the worker cron uses).
    const { data: existing, error: dedupeErr } = await admin
      .from('suggestions')
      .select('id')
      .eq('status', 'pending')
      .eq('domain', 'workload')
      .eq('card_id', transfer.cardId)
      .limit(1);
    if (dedupeErr) return { ok: false, error: dedupeErr.message };
    if (existing?.length) continue;

    const { error: insertErr } = await admin.from('suggestions').insert({
      domain: 'workload',
      title: transferTitle(transfer, names),
      body: {
        kind: 'reassign_card',
        card_id: transfer.cardId,
        to: transfer.to,
        from: transfer.from,
      } as Json,
      client_id: clientByCard[transfer.cardId] ?? null,
      card_id: transfer.cardId,
    });
    if (insertErr) return { ok: false, error: insertErr.message };
    created += 1;
  }

  // The 0006 trigger only logs suggestion *resolutions* — log the batch
  // creation with the acting manager as actor (CLAUDE.md rule 2).
  if (created > 0) {
    const { error: logErr } = await admin.from('activity_log').insert({
      actor: session.userId,
      action: 'workload.rebalanced',
      detail: { created } as Json,
    });
    if (logErr) return { ok: false, error: logErr.message };
  }

  revalidatePath('/dashboard');
  return { ok: true, data: { created } };
}
