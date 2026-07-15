import 'server-only';

/**
 * Finance module helpers (UPGRADE_SPEC §7): package quota usage, payment
 * overdue derivation, ad task status machine, and the read queries used by
 * /finance. Pure logic lives at the top; queries run under the user's RLS.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { APP_TZ, istanbulDateString } from '@/lib/dates';
import { createSupabaseServer } from '@/lib/supabase/server';
import type {
  AdTask,
  Client,
  ClientPackage,
  Json,
  Payment,
} from '@/lib/db/types';

// ---------------------------------------------------------------------------
// Quotas
// ---------------------------------------------------------------------------

/** Quota buckets tracked per package (client_packages.monthly jsonb). */
import { QUOTA_TYPES, type QuotaType } from './quota-types';
export { QUOTA_TYPES, type QuotaType };

export type MonthlyQuota = Partial<Record<QuotaType, number>>;
export type QuotaUsage = Record<QuotaType, number>;

export interface QuotaCompare {
  used: number;
  quota: number;
  /** used/quota in percent, rounded; 0 quota with usage reads as 100. */
  pct: number;
  /** true when a positive quota is exceeded — UI renders red. */
  over: boolean;
}

export function emptyUsage(): QuotaUsage {
  return { post: 0, reel: 0, story: 0, shoot: 0 };
}

/** Defensive parse of client_packages.monthly ({post,reel,story,shoot}). */
export function parseMonthlyQuota(monthly: Json | null): MonthlyQuota {
  if (!monthly || typeof monthly !== 'object' || Array.isArray(monthly))
    return {};
  const record = monthly as Record<string, Json | undefined>;
  const out: MonthlyQuota = {};
  for (const t of QUOTA_TYPES) {
    const v = record[t];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0)
      out[t] = Math.floor(v);
  }
  return out;
}

/** Per-type {used, quota, pct} for a package's monthly quota vs actual usage. */
export function compareQuota(
  monthly: Json | MonthlyQuota | null,
  usage: Partial<QuotaUsage>,
): Record<QuotaType, QuotaCompare> {
  const quota = parseMonthlyQuota(monthly as Json | null);
  const out = {} as Record<QuotaType, QuotaCompare>;
  for (const t of QUOTA_TYPES) {
    const q = quota[t] ?? 0;
    const used = usage[t] ?? 0;
    out[t] = {
      used,
      quota: q,
      pct: q > 0 ? Math.round((used / q) * 100) : used > 0 ? 100 : 0,
      over: q > 0 && used > q,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Istanbul month window
// ---------------------------------------------------------------------------

/** [start, end) of the Istanbul calendar month containing `now`, as UTC. */
export function istanbulMonthRange(now: Date = new Date()): {
  startUtc: Date;
  endUtc: Date;
} {
  const ym = formatInTimeZone(now, APP_TZ, 'yyyy-MM');
  const [y, m] = ym.split('-').map(Number);
  const nextYm =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return {
    startUtc: fromZonedTime(`${ym}-01T00:00:00`, APP_TZ),
    endUtc: fromZonedTime(`${nextYm}-01T00:00:00`, APP_TZ),
  };
}

/**
 * Cards published this Istanbul month, counted per client per quota type.
 * Primary source: activity_log `publish.success` rows (the dispatcher writes
 * one per successful publish). Fallback: cards sitting in `published` whose
 * scheduled publish time falls in the month but never got a publish.success
 * row (e.g. flipped manually). The fallback keys off `scheduled_at` — the
 * card's intended publish time — never `updated_at`, which any later edit
 * bumps and would inflate the quota. Each card counts once. `shoot` usage =
 * shoots done this month.
 */
export async function monthlyUsage(
  now: Date = new Date(),
): Promise<Record<string, QuotaUsage>> {
  const supabase = await createSupabaseServer();
  const { startUtc, endUtc } = istanbulMonthRange(now);
  const startIso = startUtc.toISOString();
  const endIso = endUtc.toISOString();

  const [logRes, cardRes, shootRes] = await Promise.all([
    supabase
      .from('activity_log')
      .select('client_id, card_id, cards:card_id(type)')
      .eq('action', 'publish.success')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('cards')
      .select('id, client_id, type')
      .eq('status', 'published')
      .gte('scheduled_at', startIso)
      .lt('scheduled_at', endIso),
    supabase
      .from('shoots')
      .select('id, client_id')
      .eq('status', 'done')
      .gte('starts_at', startIso)
      .lt('starts_at', endIso),
  ]);
  if (logRes.error) throw logRes.error;
  if (cardRes.error) throw cardRes.error;
  if (shootRes.error) throw shootRes.error;

  const usage: Record<string, QuotaUsage> = {};
  const bump = (clientId: string, type: string) => {
    if (!QUOTA_TYPES.includes(type as QuotaType)) return; // reply/other: no quota
    usage[clientId] ??= emptyUsage();
    usage[clientId][type as QuotaType] += 1;
  };

  const counted = new Set<string>();
  for (const row of logRes.data ?? []) {
    if (!row.client_id || !row.card_id || !row.cards) continue;
    if (counted.has(row.card_id)) continue; // one count per card (re-publishes)
    counted.add(row.card_id);
    bump(row.client_id, row.cards.type);
  }
  for (const card of cardRes.data ?? []) {
    if (counted.has(card.id)) continue;
    counted.add(card.id);
    bump(card.client_id, card.type);
  }
  for (const shoot of shootRes.data ?? []) bump(shoot.client_id, 'shoot');

  return usage;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * Display-time overdue derivation: a pending payment past its due date reads
 * as overdue even before the persistent sweep flips the row.
 * `due_on` is a yyyy-MM-dd date column — string compare is correct.
 */
export function isPaymentOverdue(
  payment: Pick<Payment, 'status' | 'due_on'>,
  todayIstanbul: string = istanbulDateString(),
): boolean {
  return payment.status === 'pending' && payment.due_on < todayIstanbul;
}

export function displayPaymentStatus(
  payment: Pick<Payment, 'status' | 'due_on'>,
  todayIstanbul: string = istanbulDateString(),
): Payment['status'] {
  return isPaymentOverdue(payment, todayIstanbul) ? 'overdue' : payment.status;
}

/**
 * Persistently flip pending payments past due to `overdue`. Runs under the
 * caller's RLS (mgr_write_payments) — the /finance page calls this for
 * managers on load; the status-change trigger logs each flip. Deliberately
 * does NOT revalidate, so it is safe to call during render (the action
 * wrapper in lib/actions/finance.ts revalidates).
 */
export async function sweepOverduePayments(): Promise<number> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_on', istanbulDateString())
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Ad tasks
// ---------------------------------------------------------------------------

export type AdStatus = AdTask['status'];

/** planned → active → done|cancelled (planned can also be cancelled). */
export const AD_TRANSITIONS: Record<AdStatus, AdStatus[]> = {
  planned: ['active', 'cancelled'],
  active: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

export function canTransitionAd(from: AdStatus, to: AdStatus): boolean {
  return AD_TRANSITIONS[from].includes(to);
}

/** Shape of ad_tasks.results — every field optional, entered on completion. */
export interface AdResults {
  reach?: number;
  clicks?: number;
  spend?: number;
  note?: string;
}

export function parseAdResults(results: Json | null): AdResults {
  if (!results || typeof results !== 'object' || Array.isArray(results))
    return {};
  const r = results as Record<string, Json | undefined>;
  const out: AdResults = {};
  if (typeof r.reach === 'number') out.reach = r.reach;
  if (typeof r.clicks === 'number') out.clicks = r.clicks;
  if (typeof r.spend === 'number') out.spend = r.spend;
  if (typeof r.note === 'string') out.note = r.note;
  return out;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function fmtMoney(amount: number, currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Read queries for /finance (user RLS)
// ---------------------------------------------------------------------------

type ClientRef = Pick<Client, 'id' | 'name'>;

export type PackageWithClient = ClientPackage & { clients: ClientRef | null };
export type PaymentWithClient = Payment & { clients: ClientRef | null };
export type AdTaskWithClient = AdTask & { clients: ClientRef | null };

export async function listPackagesWithClients(): Promise<PackageWithClient[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('client_packages')
    .select('*, clients(id, name)')
    .order('active', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as PackageWithClient[];
}

export async function listPaymentsWithClients(): Promise<PaymentWithClient[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('payments')
    .select('*, clients(id, name)')
    .order('due_on', { ascending: true });
  if (error) throw error;
  return data as PaymentWithClient[];
}

export async function listAdTasksWithClients(): Promise<AdTaskWithClient[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('ad_tasks')
    .select('*, clients(id, name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as AdTaskWithClient[];
}
