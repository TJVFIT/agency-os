'use server';

/**
 * Finance mutations (UPGRADE_SPEC §7) — all manager/admin gated (matching the
 * mgr_write_* RLS policies in migration 0006). payments/ad_tasks insert +
 * status changes are logged by DB triggers; client_packages has no trigger,
 * so package mutations log through the service-role client with the actor
 * captured explicitly (CLAUDE.md rule 2).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { istanbulDateString } from '@/lib/dates';
import { canTransitionAd, sweepOverduePayments } from '@/lib/finance';
import { PLATFORMS } from '@/lib/db/types';
import type { Json } from '@/lib/db/types';
import type { ActionResult } from '@/lib/actions/cards';

function revalidateFinance(clientId?: string) {
  revalidatePath('/finance');
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

const quotaSchema = z.object({
  post: z.number().int().min(0).max(1000).default(0),
  reel: z.number().int().min(0).max(1000).default(0),
  story: z.number().int().min(0).max(1000).default(0),
  shoot: z.number().int().min(0).max(1000).default(0),
});

const createPackageSchema = z.object({
  clientId: z.uuid(),
  name: z.string().min(1).max(120),
  monthly: quotaSchema,
  price: z.number().min(0),
  currency: z.string().length(3).toUpperCase().default('TRY'),
  startsOn: z.iso.date().optional(),
});

export async function createPackage(
  input: z.input<typeof createPackageSchema>,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole('admin', 'manager');
  const parsed = createPackageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('client_packages')
    .insert({
      client_id: parsed.data.clientId,
      name: parsed.data.name,
      monthly: parsed.data.monthly as Json,
      price: parsed.data.price,
      currency: parsed.data.currency,
      ...(parsed.data.startsOn && { starts_on: parsed.data.startsOn }),
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: parsed.data.clientId,
      action: 'package.created',
      detail: {
        package_id: data.id,
        name: parsed.data.name,
        price: parsed.data.price,
      },
    });

  revalidateFinance(parsed.data.clientId);
  return { ok: true, data: { id: data.id } };
}

const updatePackageSchema = z.object({
  packageId: z.uuid(),
  name: z.string().min(1).max(120).optional(),
  monthly: quotaSchema.optional(),
  price: z.number().min(0).optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  active: z.boolean().optional(),
});

export async function updatePackage(
  input: z.input<typeof updatePackageSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = updatePackageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { packageId, ...fields } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('client_packages')
    .update({
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.monthly !== undefined && { monthly: fields.monthly as Json }),
      ...(fields.price !== undefined && { price: fields.price }),
      ...(fields.currency !== undefined && { currency: fields.currency }),
      ...(fields.active !== undefined && { active: fields.active }),
    })
    .eq('id', packageId)
    .select('id, client_id, name')
    .single();
  if (error) return { ok: false, error: error.message };

  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: data.client_id,
      action: 'package.updated',
      detail: {
        package_id: packageId,
        name: data.name,
        fields: Object.keys(fields),
      },
    });

  revalidateFinance(data.client_id);
  return { ok: true };
}

export async function deactivatePackage(input: {
  packageId: string;
}): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = z.object({ packageId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('client_packages')
    .update({ active: false })
    .eq('id', parsed.data.packageId)
    .select('id, client_id, name')
    .single();
  if (error) return { ok: false, error: error.message };

  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: data.client_id,
      action: 'package.deactivated',
      detail: { package_id: data.id, name: data.name },
    });

  revalidateFinance(data.client_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

const createPaymentSchema = z.object({
  clientId: z.uuid(),
  kind: z.enum(['package', 'extra']).default('package'),
  title: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.string().length(3).toUpperCase().default('TRY'),
  dueOn: z.iso.date(),
  note: z.string().max(500).default(''),
});

export async function createPayment(
  input: z.input<typeof createPaymentSchema>,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole('admin', 'manager');
  const parsed = createPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('payments')
    .insert({
      client_id: parsed.data.clientId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      due_on: parsed.data.dueOn,
      note: parsed.data.note,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidateFinance(parsed.data.clientId);
  return { ok: true, data: { id: data.id } };
}

export async function markPaid(input: {
  paymentId: string;
}): Promise<ActionResult> {
  await requireRole('admin', 'manager');
  const parsed = z.object({ paymentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'paid', paid_on: istanbulDateString() })
    .eq('id', parsed.data.paymentId)
    .in('status', ['pending', 'overdue']) // idempotent: paid stays paid
    .select('id, client_id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'notFound' };

  revalidateFinance(data[0].client_id);
  return { ok: true };
}

/**
 * Persistent overdue sweep (pending + past due → overdue). The /finance page
 * runs the underlying sweep during render for managers; this action wrapper
 * exists for explicit invocations (buttons, other pages) and revalidates.
 */
export async function updatePaymentStatuses(): Promise<
  ActionResult<{ flipped: number }>
> {
  await requireRole('admin', 'manager');
  try {
    const flipped = await sweepOverduePayments();
    if (flipped > 0) revalidateFinance();
    return { ok: true, data: { flipped } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'generic' };
  }
}

// ---------------------------------------------------------------------------
// Ad tasks
// ---------------------------------------------------------------------------

const adResultsSchema = z.object({
  reach: z.number().min(0).optional(),
  clicks: z.number().min(0).optional(),
  spend: z.number().min(0).optional(),
  note: z.string().max(500).optional(),
});

const dateRangeRefine = <
  T extends { startsOn?: string | null; endsOn?: string | null },
>(
  v: T,
) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn;

const createAdTaskSchema = z
  .object({
    clientId: z.uuid(),
    cardId: z.uuid().nullish(),
    platform: z.enum(PLATFORMS),
    objective: z.string().max(300).default(''),
    budget: z.number().min(0).default(0),
    currency: z.string().length(3).toUpperCase().default('TRY'),
    startsOn: z.iso.date().nullish(),
    endsOn: z.iso.date().nullish(),
  })
  .refine(dateRangeRefine);

export async function createAdTask(
  input: z.input<typeof createAdTaskSchema>,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole('admin', 'manager');
  const parsed = createAdTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('ad_tasks')
    .insert({
      client_id: parsed.data.clientId,
      card_id: parsed.data.cardId ?? null,
      platform: parsed.data.platform,
      objective: parsed.data.objective,
      budget: parsed.data.budget,
      currency: parsed.data.currency,
      starts_on: parsed.data.startsOn ?? null,
      ends_on: parsed.data.endsOn ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidateFinance(parsed.data.clientId);
  return { ok: true, data: { id: data.id } };
}

const updateAdTaskSchema = z
  .object({
    adTaskId: z.uuid(),
    platform: z.enum(PLATFORMS).optional(),
    objective: z.string().max(300).optional(),
    budget: z.number().min(0).optional(),
    currency: z.string().length(3).toUpperCase().optional(),
    startsOn: z.iso.date().nullish(),
    endsOn: z.iso.date().nullish(),
  })
  .refine(dateRangeRefine);

/** Meta edits only — status moves go through transitionAdTask. */
export async function updateAdTask(
  input: z.input<typeof updateAdTaskSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = updateAdTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { adTaskId, ...fields } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('ad_tasks')
    .update({
      ...(fields.platform !== undefined && { platform: fields.platform }),
      ...(fields.objective !== undefined && { objective: fields.objective }),
      ...(fields.budget !== undefined && { budget: fields.budget }),
      ...(fields.currency !== undefined && { currency: fields.currency }),
      ...(fields.startsOn !== undefined && { starts_on: fields.startsOn }),
      ...(fields.endsOn !== undefined && { ends_on: fields.endsOn }),
    })
    .eq('id', adTaskId)
    .select('id, client_id, platform')
    .single();
  if (error) return { ok: false, error: error.message };

  // ad_tasks trigger only logs insert + status change — log meta edits here.
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: data.client_id,
      action: 'ad.updated',
      detail: {
        ad_id: adTaskId,
        platform: data.platform,
        fields: Object.keys(fields),
      },
    });

  revalidateFinance(data.client_id);
  return { ok: true };
}

const transitionAdTaskSchema = z.object({
  adTaskId: z.uuid(),
  to: z.enum(['active', 'done', 'cancelled']),
  /** Optional results entry when closing the task (to = done). */
  results: adResultsSchema.optional(),
});

export async function transitionAdTask(
  input: z.input<typeof transitionAdTaskSchema>,
): Promise<ActionResult> {
  await requireRole('admin', 'manager');
  const parsed = transitionAdTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { adTaskId, to, results } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: ad, error: loadErr } = await supabase
    .from('ad_tasks')
    .select('id, client_id, status, results')
    .eq('id', adTaskId)
    .single();
  if (loadErr || !ad) return { ok: false, error: 'notFound' };
  if (!canTransitionAd(ad.status, to))
    return { ok: false, error: 'unknown_transition' };

  const mergedResults =
    results && to === 'done'
      ? ({
          ...((ad.results ?? {}) as Record<string, Json | undefined>),
          ...results,
        } as Json)
      : undefined;

  const { error } = await supabase
    .from('ad_tasks')
    .update({
      status: to,
      ...(mergedResults !== undefined && { results: mergedResults }),
    })
    .eq('id', adTaskId)
    .eq('status', ad.status); // optimistic lock — no double transitions
  if (error) return { ok: false, error: error.message };

  revalidateFinance(ad.client_id);
  return { ok: true };
}

const setAdResultsSchema = z.object({
  adTaskId: z.uuid(),
  results: adResultsSchema,
});

/** Results entry/edit on a done task ({reach?, clicks?, spend?, note?}). */
export async function setAdResults(
  input: z.input<typeof setAdResultsSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = setAdResultsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data: ad, error: loadErr } = await supabase
    .from('ad_tasks')
    .select('id, client_id, platform, results')
    .eq('id', parsed.data.adTaskId)
    .single();
  if (loadErr || !ad) return { ok: false, error: 'notFound' };

  const merged = {
    ...((ad.results ?? {}) as Record<string, Json | undefined>),
    ...parsed.data.results,
  } as Json;
  const { error } = await supabase
    .from('ad_tasks')
    .update({ results: merged })
    .eq('id', ad.id);
  if (error) return { ok: false, error: error.message };

  // Not a status change — trigger stays silent, log explicitly (rule 2).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: ad.client_id,
      action: 'ad.results_updated',
      detail: { ad_id: ad.id, platform: ad.platform, ...parsed.data.results },
    });

  revalidateFinance(ad.client_id);
  return { ok: true };
}
