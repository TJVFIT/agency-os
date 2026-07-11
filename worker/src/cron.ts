/**
 * Scheduled jobs (SPEC §11 + UPGRADE_SPEC §5/§6/§7/§9), Europe/Istanbul.
 * The publish dispatcher runs on a 60s interval; the rest are node-cron.
 * Each is idempotent/deduped so a double-fire or restart can't double-post
 * or spam idea cards / suggestions.
 *
 * v2: the dispatcher gates every due card on the compliance engine
 * (lib/compliance.ts) and on the automation mode ('publish' domain); the
 * planner/report crons honor their domains too — in suggest mode they write
 * `suggestions` rows (Öneriler inbox) instead of acting. Two new daily crons:
 * 08:00 per-staff günlük plan, 10:30 eksik-işler detector.
 */

import cron from 'node-cron';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { checkCompliance, type ComplianceIssue } from '../../lib/compliance';
import { parseBrandProfile } from '../../lib/db/domain';
import type { Json } from '../../lib/db/types';
import { db, logActivity } from './supabase';
import { notifyManagers, notifyUser } from './telegram';
import { mayAutoAct } from './automation';
import { sendPushToManagers, sendPushToProfile } from './push';
import { r2Configured } from './r2';
import { log } from './log';
import { workerEnv } from './env';

const TZ = 'Europe/Istanbul';
const DAY_MS = 864e5;

/** Telegram + web-push to admins/managers, both best-effort. */
async function managersAll(text: string, url = '/dashboard'): Promise<void> {
  await notifyManagers(text).catch(() => {});
  await sendPushToManagers({ title: 'Agency OS', body: text, url });
}

/** Istanbul-local day bounds (Turkey is UTC+3 year-round, no DST). */
function istanbulDay(now: Date): { day: string; start: Date; end: Date } {
  const day = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
  const start = fromZonedTime(`${day}T00:00:00`, TZ);
  return { day, start, end: new Date(start.getTime() + DAY_MS) };
}

// ---------- suggestions helper (UPGRADE_SPEC §9) ----------

/**
 * Insert a suggestions row unless a pending one already exists for the same
 * scope. Dedupe key: card_id when given, else a jsonb containment match on
 * `dedupeBody`, else client_id. Returns true when a new row was created.
 *
 * The 0006 trigger only logs suggestion *updates* (resolve), so inserts are
 * logged here (CLAUDE.md rule 2). `batched: true` marks rows whose creation
 * is announced by a summary message from the calling cron — the notification
 * loop skips per-row manager pings for those.
 */
async function insertSuggestion(opts: {
  domain: string;
  title: string;
  body: Record<string, unknown>;
  clientId?: string | null;
  cardId?: string | null;
  dedupeBody?: Record<string, unknown>;
  batched?: boolean;
}): Promise<boolean> {
  // clientId is always ANDed in (when present) so a per-client dedupe can be
  // narrowed further by cardId or a body match — e.g. a client's weekly
  // planner/report suggestion is keyed by client *and* week, so a stale row
  // from a prior week no longer blocks the current week.
  let dedupe = db()
    .from('suggestions')
    .select('id')
    .eq('status', 'pending')
    .eq('domain', opts.domain);
  if (opts.clientId) dedupe = dedupe.eq('client_id', opts.clientId);
  if (opts.cardId) dedupe = dedupe.eq('card_id', opts.cardId);
  else if (opts.dedupeBody) dedupe = dedupe.contains('body', opts.dedupeBody);
  const { data: existing } = await dedupe.limit(1);
  if (existing?.length) return false;

  const { data: created, error } = await db()
    .from('suggestions')
    .insert({
      domain: opts.domain,
      title: opts.title,
      body: opts.body as Json,
      client_id: opts.clientId ?? null,
      card_id: opts.cardId ?? null,
    })
    .select('id')
    .single();
  if (error) {
    log.warn(
      { err: error.message, domain: opts.domain },
      'suggestion insert failed',
    );
    return false;
  }

  await logActivity('suggestion.created', {
    clientId: opts.clientId ?? null,
    cardId: opts.cardId ?? null,
    detail: {
      suggestion_id: created?.id,
      domain: opts.domain,
      title: opts.title,
      ...(opts.batched ? { batched: true } : {}),
    },
  }).catch(() => {});
  return true;
}

// ---------- compliance gate (UPGRADE_SPEC §5) ----------

/**
 * Run the pure compliance engine over a card's TR content for each of its
 * platforms. `scheduledAt` is passed as null on purpose: due cards are past
 * their scheduled_at by definition — the schedule-sanity check belongs to the
 * scheduling UI, not to the dispatcher/detector. Issues identical across
 * platforms are de-duplicated to keep the payload compact.
 */
async function checkCardCompliance(
  cardId: string,
  clientId: string,
  platforms: string[],
): Promise<{ ok: boolean; issues: ComplianceIssue[] }> {
  const [{ data: client }, { data: content }] = await Promise.all([
    db().from('clients').select('brand_profile').eq('id', clientId).single(),
    db()
      .from('card_contents')
      .select('caption, hashtags, media_asset_ids')
      .eq('card_id', cardId)
      .eq('lang', 'tr')
      .maybeSingle(),
  ]);
  const bannedWords = parseBrandProfile(client?.brand_profile).banned_words;

  const seen = new Set<string>();
  const issues: ComplianceIssue[] = [];
  for (const platform of platforms.length ? platforms : ['instagram']) {
    const result = checkCompliance({
      caption: content?.caption ?? '',
      hashtags: content?.hashtags ?? [],
      mediaCount: content?.media_asset_ids?.length ?? 0,
      platform,
      bannedWords,
      scheduledAt: null,
      now: new Date(),
    });
    for (const issue of result.issues) {
      const key = `${issue.code}:${issue.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(issue);
    }
  }
  return { ok: issues.length === 0, issues };
}

// ---------- publish dispatcher (every 60s) ----------
async function dispatchScheduled(): Promise<void> {
  const now = new Date().toISOString();
  const { data: due } = await db()
    .from('cards')
    .select('id, title, client_id, platforms')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);
  if (!due?.length) return;

  const autoPublish = await mayAutoAct('publish');

  for (const card of due) {
    // Dedupe: skip if a publish job for this card is pending OR has already
    // failed terminally. Including 'error' is critical — otherwise a card
    // that exhausted its 5 attempts stays 'scheduled' and the dispatcher
    // would re-enqueue a fresh publish cycle every 60s forever (Postiz
    // hammering + Telegram spam). A manager clears the errored job to retry.
    const { data: existing } = await db()
      .from('ai_jobs')
      .select('id')
      .eq('kind', 'publish')
      .in('status', ['queued', 'running', 'error'])
      .contains('payload', { card_id: card.id });
    if (existing?.length) continue;

    // Approval gate (mirrors handlePublish's defense-in-depth check). A card
    // that reached 'scheduled' without an 'approved' activity_log record would
    // be skipped 'no_approval' by handlePublish and left 'done' — the card
    // stays 'scheduled' and, since 'done' isn't in the dedupe set above, the
    // dispatcher would enqueue a fresh publish job every 60s forever. Surface
    // it once via a pending suggestion (which also dedupes later ticks) and
    // never enqueue.
    const { count: approvals } = await db()
      .from('activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('card_id', card.id)
      .eq('action', 'card.status_changed')
      .contains('detail', { to: 'approved' });
    if (!approvals) {
      const fresh = await insertSuggestion({
        domain: 'missing_work',
        title: `Onay kaydı yok: ${card.title}`,
        body: { kind: 'info', reason: 'no_approval' },
        clientId: card.client_id,
        cardId: card.id,
        batched: true, // notified once below, not per-row
      });
      if (fresh) {
        await logActivity('publish.blocked', {
          clientId: card.client_id,
          cardId: card.id,
          detail: { reason: 'no_approval' },
        });
        await managersAll(
          `⚠️ Yayın engellendi: ${card.title} — onay kaydı yok, kart planlıda takıldı.`,
          `/clients/${card.client_id}`,
        );
        log.warn({ card_id: card.id }, 'publish blocked: no approval record');
      }
      continue;
    }

    // Compliance gate — a failing card never reaches the publish queue.
    // The suggestion insert doubles as the dedupe: while it stays pending
    // the 60s ticks stay silent (no publish.blocked spam).
    const { ok, issues } = await checkCardCompliance(
      card.id,
      card.client_id,
      card.platforms,
    );
    if (!ok) {
      const fresh = await insertSuggestion({
        domain: 'compliance',
        title: card.title,
        body: { kind: 'info', issues },
        clientId: card.client_id,
        cardId: card.id,
        // publish.blocked already notifies managers — avoid a double ping.
        batched: true,
      });
      if (fresh) {
        await logActivity('publish.blocked', {
          clientId: card.client_id,
          cardId: card.id,
          detail: { issues: issues as unknown as Json },
        });
        log.warn({ card_id: card.id, issues }, 'publish blocked (compliance)');
      }
      continue;
    }

    // Automation gate ('publish' domain): in suggest mode the dispatcher
    // never enqueues — it writes a suggestion whose acceptance from the
    // dashboard enqueues exactly this job.
    if (!autoPublish) {
      const fresh = await insertSuggestion({
        domain: 'publish',
        title: card.title,
        body: {
          kind: 'enqueue_job',
          job: { kind: 'publish', payload: { card_id: card.id } },
        },
        clientId: card.client_id,
        cardId: card.id,
      });
      if (fresh)
        log.info({ card_id: card.id }, 'publish suggested (automation gate)');
      continue;
    }

    await db()
      .from('ai_jobs')
      .insert({ kind: 'publish', payload: { card_id: card.id } });
    log.info({ card_id: card.id }, 'publish enqueued');
  }
}

// ---------- Monday 09:00 planner ----------
async function runPlanner(): Promise<void> {
  const weekStart = nextMondayIso();
  const auto = await mayAutoAct('planner');
  const { data: clients } = await db()
    .from('clients')
    .select('id, name')
    .eq('active', true);
  let suggested = 0;
  for (const client of clients ?? []) {
    const { count } = await db()
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('status', 'idea')
      .neq('status', 'archived');
    if ((count ?? 0) >= 5) continue; // SPEC: skip if ≥5 ideas already

    if (auto) {
      await db()
        .from('ai_jobs')
        .insert({
          kind: 'plan',
          payload: { client_id: client.id, week_start: weekStart },
        });
    } else {
      // Suggest mode: one row per client; accepting it enqueues the plan job.
      const fresh = await insertSuggestion({
        domain: 'planner',
        title: `Haftalık plan: ${client.name}`,
        body: {
          kind: 'enqueue_job',
          week_start: weekStart, // dedupe key: one row per client *per week*
          job: {
            kind: 'plan',
            payload: { client_id: client.id, week_start: weekStart },
          },
        },
        clientId: client.id,
        dedupeBody: { week_start: weekStart },
        batched: true, // one summary below instead of a ping per client
      });
      if (fresh) suggested += 1;
    }
  }
  if (!auto && suggested > 0) {
    await managersAll(
      `📋 Haftalık plan önerileri hazır (${suggested} müşteri) — Öneriler kutusundan başlatın.`,
    );
  }
  log.info({ auto }, 'weekly planner done');
}

// ---------- Friday 17:00 reports ----------

/**
 * Auto-fill report metrics (UPGRADE_SPEC §7): publish counts per platform
 * for the week, package quota usage this month, payments summary.
 */
async function computeClientMetrics(
  clientId: string,
  weekStart: string,
): Promise<Record<string, unknown>> {
  const start = fromZonedTime(`${weekStart}T00:00:00`, TZ);
  const end = new Date(start.getTime() + 7 * DAY_MS);

  // Publish counts for the week from activity_log 'publish.success'.
  const { data: weekPubs } = await db()
    .from('activity_log')
    .select('card_id')
    .eq('client_id', clientId)
    .eq('action', 'publish.success')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());
  const byPlatform: Record<string, number> = {};
  const weekCardIds = [
    ...new Set(
      (weekPubs ?? []).map((p) => p.card_id).filter((id): id is string => !!id),
    ),
  ];
  if (weekCardIds.length) {
    const { data: cards } = await db()
      .from('cards')
      .select('id, platforms')
      .in('id', weekCardIds);
    for (const card of cards ?? [])
      for (const platform of card.platforms)
        byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;
  }

  // Quota usage: published cards this month by type vs the active package.
  const monthStart = fromZonedTime(
    `${formatInTimeZone(new Date(), TZ, 'yyyy-MM')}-01T00:00:00`,
    TZ,
  );
  const { data: monthPubs } = await db()
    .from('activity_log')
    .select('card_id')
    .eq('client_id', clientId)
    .eq('action', 'publish.success')
    .gte('created_at', monthStart.toISOString());
  const monthCardIds = [
    ...new Set(
      (monthPubs ?? [])
        .map((p) => p.card_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const usedByType: Record<string, number> = {};
  if (monthCardIds.length) {
    const { data: cards } = await db()
      .from('cards')
      .select('id, type')
      .in('id', monthCardIds);
    for (const card of cards ?? [])
      usedByType[card.type] = (usedByType[card.type] ?? 0) + 1;
  }
  const { data: packages } = await db()
    .from('client_packages')
    .select('name, monthly')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('starts_on', { ascending: false })
    .limit(1);
  const pkg = packages?.[0];

  // Payments summary: open counts.
  const paymentCount = async (status: 'pending' | 'overdue') => {
    const { count } = await db()
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', status);
    return count ?? 0;
  };

  return {
    publishes: { total: (weekPubs ?? []).length, by_platform: byPlatform },
    quota: {
      package: pkg?.name ?? null,
      monthly: pkg?.monthly ?? {},
      used: usedByType,
    },
    payments: {
      pending: await paymentCount('pending'),
      overdue: await paymentCount('overdue'),
    },
  };
}

async function runReports(): Promise<void> {
  const weekStart = thisMondayIso();
  const auto = await mayAutoAct('reports');
  const { data: clients } = await db()
    .from('clients')
    .select('id, name')
    .eq('active', true);
  let suggested = 0;
  for (const client of clients ?? []) {
    // Auto-fill metrics first so the report prompt sees real data. Computed
    // values win over stale keys, hand-entered extras survive the merge.
    const computed = await computeClientMetrics(client.id, weekStart);
    const { data: report } = await db()
      .from('reports')
      .select('metrics')
      .eq('client_id', client.id)
      .eq('week_start', weekStart)
      .maybeSingle();
    const metrics = {
      ...((report?.metrics as Record<string, unknown> | null) ?? {}),
      ...computed,
    } as Json;
    await db()
      .from('reports')
      .upsert(
        { client_id: client.id, week_start: weekStart, metrics },
        { onConflict: 'client_id,week_start' },
      );

    if (auto) {
      await db()
        .from('ai_jobs')
        .insert({
          kind: 'report',
          payload: { client_id: client.id, week_start: weekStart, metrics },
        });
    } else {
      const fresh = await insertSuggestion({
        domain: 'reports',
        title: `Haftalık rapor: ${client.name}`,
        body: {
          kind: 'enqueue_job',
          week_start: weekStart, // dedupe key: one row per client *per week*
          job: {
            kind: 'report',
            payload: { client_id: client.id, week_start: weekStart, metrics },
          },
        },
        clientId: client.id,
        dedupeBody: { week_start: weekStart },
        batched: true,
      });
      if (fresh) suggested += 1;
    }
  }
  if (auto) {
    await managersAll('📊 Haftalık raporlar hazırlanıyor.', '/reports');
  } else if (suggested > 0) {
    await managersAll(
      `📊 Haftalık rapor önerileri hazır (${suggested} müşteri) — Öneriler kutusundan başlatın.`,
    );
  }
}

// ---------- daily 08:00 günlük plan (UPGRADE_SPEC §6) ----------
async function runDailyPlans(): Promise<void> {
  const now = new Date();
  const { start: dayStart, end: dayEnd } = istanbulDay(now);

  const { data: profiles } = await db().from('profiles').select('id, role');
  if (!profiles?.length) return;

  // Cards assigned + due today or overdue, still in flight.
  const { data: dueCards } = await db()
    .from('cards')
    .select('id, title, assignee, due_at, status')
    .not('assignee', 'is', null)
    .not('due_at', 'is', null)
    .lt('due_at', dayEnd.toISOString())
    .not('status', 'in', '(published,archived)');

  // Today's shoots still on the calendar; crew is uuid[] → filter in JS.
  const { data: shoots } = await db()
    .from('shoots')
    .select('id, title, starts_at, crew, status')
    .gte('starts_at', dayStart.toISOString())
    .lt('starts_at', dayEnd.toISOString())
    .in('status', ['planned', 'confirmed']);

  // Managers additionally get a client-coverage line (next 5 days).
  let coverage = '';
  const { data: clients } = await db()
    .from('clients')
    .select('id, name')
    .eq('active', true);
  if (clients?.length) {
    const in5 = new Date(now.getTime() + 5 * DAY_MS).toISOString();
    const uncovered: string[] = [];
    for (const client of clients) {
      const { count } = await db()
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .in('status', ['scheduled', 'approved'])
        .lte('scheduled_at', in5);
      if ((count ?? 0) === 0) uncovered.push(client.name);
    }
    coverage = uncovered.length
      ? `📡 Kapsama: ${clients.length - uncovered.length}/${clients.length} müşteride plan var — eksik: ${uncovered
          .slice(0, 5)
          .join(', ')}${uncovered.length > 5 ? '…' : ''}`
      : `📡 Kapsama: tüm müşterilerde (${clients.length}) önümüzdeki 5 gün planlı içerik var.`;
  }

  const dateLabel = formatInTimeZone(now, TZ, 'dd.MM.yyyy');
  for (const profile of profiles) {
    const myCards = (dueCards ?? []).filter((c) => c.assignee === profile.id);
    const myShoots = (shoots ?? []).filter((s) =>
      (s.crew ?? []).includes(profile.id),
    );
    if (!myCards.length && !myShoots.length) continue;

    const lines = [`📋 Bugünün planı — ${dateLabel}`];
    if (myCards.length) {
      lines.push('Kartlar:');
      for (const card of myCards.slice(0, 10)) {
        const overdue =
          card.due_at && new Date(card.due_at) < dayStart ? ' (gecikmiş)' : '';
        lines.push(`• ${card.title}${overdue}`);
      }
      if (myCards.length > 10) lines.push(`… +${myCards.length - 10} kart`);
    }
    if (myShoots.length) {
      lines.push('Çekimler:');
      for (const shoot of myShoots)
        lines.push(
          `• ${shoot.title} — ${formatInTimeZone(new Date(shoot.starts_at), TZ, 'HH:mm')}`,
        );
    }
    if ((profile.role === 'admin' || profile.role === 'manager') && coverage)
      lines.push(coverage);

    const text = lines.join('\n');
    await notifyUser(profile.id, text).catch(() => {});
    await sendPushToProfile(profile.id, {
      title: 'Bugünün planı',
      body: text,
      url: '/dashboard',
    });
  }
  log.info('daily plans sent');
}

// ---------- daily 10:30 eksik-işler detector (UPGRADE_SPEC §6) ----------
async function runMissingWorkDetector(): Promise<void> {
  const now = new Date();
  const { day } = istanbulDay(now);
  const threeDaysAgo = new Date(now.getTime() - 3 * DAY_MS).toISOString();
  const counts = { stuck: 0, shoots: 0, payments: 0, compliance: 0 };

  // 1. Stuck cards: in-flight statuses untouched for 3+ days.
  const { data: stuck } = await db()
    .from('cards')
    .select('id, title, status, client_id, updated_at')
    .in('status', ['copy_draft', 'visual_ready', 'translated'])
    .lt('updated_at', threeDaysAgo);
  for (const card of stuck ?? []) {
    const fresh = await insertSuggestion({
      domain: 'missing_work',
      title: `Takılı kart: ${card.title}`,
      body: {
        kind: 'info',
        reason: 'stuck_card',
        status: card.status,
        updated_at: card.updated_at,
      },
      clientId: card.client_id,
      cardId: card.id,
      batched: true,
    });
    if (fresh) counts.stuck += 1;
  }

  // 2. Shoots done without their kurgu/metin/kontrol tasks opened.
  const { data: doneShoots } = await db()
    .from('shoots')
    .select('id, title, client_id')
    .eq('status', 'done')
    .eq('tasks_opened', false);
  for (const shoot of doneShoots ?? []) {
    const fresh = await insertSuggestion({
      domain: 'missing_work',
      title: `Çekim görevleri açılmadı: ${shoot.title}`,
      body: { kind: 'info', reason: 'shoot_tasks_missing', shoot_id: shoot.id },
      clientId: shoot.client_id,
      dedupeBody: { reason: 'shoot_tasks_missing', shoot_id: shoot.id },
      batched: true,
    });
    if (fresh) counts.shoots += 1;
  }

  // 3. Overdue payments: pending + past due → flip to overdue (the trigger
  //    logs payment.status_changed, which pings managers) + suggestion.
  const { data: latePayments } = await db()
    .from('payments')
    .select('id, title, client_id, due_on')
    .eq('status', 'pending')
    .lt('due_on', day);
  for (const payment of latePayments ?? []) {
    await db()
      .from('payments')
      .update({ status: 'overdue' })
      .eq('id', payment.id);
    const fresh = await insertSuggestion({
      domain: 'missing_work',
      title: `Geciken ödeme: ${payment.title}`,
      body: {
        kind: 'info',
        reason: 'payment_overdue',
        payment_id: payment.id,
        due_on: payment.due_on,
      },
      clientId: payment.client_id,
      dedupeBody: { reason: 'payment_overdue', payment_id: payment.id },
      batched: true,
    });
    if (fresh) counts.payments += 1;
  }

  // 4. Scheduled cards failing compliance — caught before they come due.
  const { data: scheduled } = await db()
    .from('cards')
    .select('id, title, client_id, platforms')
    .eq('status', 'scheduled');
  for (const card of scheduled ?? []) {
    const { ok, issues } = await checkCardCompliance(
      card.id,
      card.client_id,
      card.platforms,
    );
    if (ok) continue;
    const fresh = await insertSuggestion({
      domain: 'missing_work',
      title: `Uygunluk sorunu: ${card.title}`,
      body: { kind: 'info', reason: 'compliance', issues },
      clientId: card.client_id,
      cardId: card.id,
      batched: true,
    });
    if (fresh) counts.compliance += 1;
  }

  const total =
    counts.stuck + counts.shoots + counts.payments + counts.compliance;
  if (total > 0) {
    await managersAll(
      `🔍 Eksik işler: ${total} yeni bulgu — takılı kart: ${counts.stuck}, çekim görevi: ${counts.shoots}, geciken ödeme: ${counts.payments}, uygunluk: ${counts.compliance}`,
    );
  }
  log.info(counts, 'missing work detector done');
}

// ---------- daily 10:00 gap radar ----------
async function runGapRadar(): Promise<void> {
  const { data: clients } = await db()
    .from('clients')
    .select('id, name')
    .eq('active', true);
  const in5 = new Date(Date.now() + 5 * DAY_MS).toISOString();
  for (const client of clients ?? []) {
    const { count } = await db()
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .in('status', ['scheduled', 'approved'])
      .lte('scheduled_at', in5);
    if ((count ?? 0) === 0) {
      await managersAll(
        `🚩 ${client.name}: önümüzdeki 5 günde planlı içerik yok.`,
        `/clients/${client.id}`,
      );
    }
  }
}

// ---------- daily 03:00 retention pruning (SPEC §3 + §11) ----------
async function runRetention(): Promise<void> {
  const yearAgo = new Date(Date.now() - 365 * DAY_MS).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * DAY_MS).toISOString();
  await db().from('activity_log').delete().lt('created_at', yearAgo);
  await db()
    .from('ai_jobs')
    .delete()
    .in('status', ['done', 'error'])
    .lt('updated_at', sixtyDaysAgo);
  await sweepRawInputs();
  log.info('retention pruning done');
}

// R2 lifecycle sweep (SPEC §11): raw reel/upload inputs live under private/ and
// are only needed until their variants render. Best-effort delete of anything
// under private/ older than 30 days; skips quietly when R2 is unconfigured and
// never throws into the cron. r2.ts exposes no list/delete, so a scoped
// S3 client is built here (same config as r2.ts) to avoid touching that file.
const RAW_PREFIX = 'private/';
const RAW_MAX_AGE_MS = 30 * DAY_MS;

async function sweepRawInputs(): Promise<void> {
  if (!r2Configured()) return;
  const env = workerEnv();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const cutoff = Date.now() - RAW_MAX_AGE_MS;
  let token: string | undefined;
  let deleted = 0;
  try {
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: env.R2_BUCKET,
          Prefix: RAW_PREFIX,
          ContinuationToken: token,
        }),
      );
      const stale = (page.Contents ?? []).filter(
        (o) => o.Key && o.LastModified && o.LastModified.getTime() < cutoff,
      );
      if (stale.length) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: env.R2_BUCKET,
            Delete: {
              Objects: stale.map((o) => ({ Key: o.Key! })),
              Quiet: true,
            },
          }),
        );
        deleted += stale.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    if (deleted > 0) {
      await logActivity('retention.r2_sweep', {
        detail: { prefix: RAW_PREFIX, deleted, older_than_days: 30 },
      }).catch(() => {});
      log.info({ deleted }, 'R2 raw-input sweep done');
    }
  } catch (e) {
    log.warn({ err: String(e) }, 'R2 raw-input sweep failed (best-effort)');
  }
}

function thisMondayIso(): string {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
function nextMondayIso(): string {
  const d = new Date(thisMondayIso() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function startCron(): () => void {
  const dispatcher = setInterval(() => {
    dispatchScheduled().catch((e) =>
      log.error({ err: String(e) }, 'dispatcher error'),
    );
  }, 60_000);

  const tasks = [
    cron.schedule('0 9 * * 1', () => void runPlanner(), { timezone: TZ }),
    cron.schedule('0 17 * * 5', () => void runReports(), { timezone: TZ }),
    cron.schedule('0 8 * * *', () => void runDailyPlans(), { timezone: TZ }),
    cron.schedule('30 10 * * *', () => void runMissingWorkDetector(), {
      timezone: TZ,
    }),
    cron.schedule('0 10 * * *', () => void runGapRadar(), { timezone: TZ }),
    cron.schedule('0 3 * * *', () => void runRetention(), { timezone: TZ }),
  ];

  // Heartbeat every 5 min (SPEC §14: dashboard shows worker liveness).
  const heartbeat = setInterval(() => {
    logActivity('worker.heartbeat', {
      detail: { tz: workerEnv().TZ },
    }).catch(() => {});
  }, 5 * 60_000);

  log.info('cron jobs scheduled');
  return () => {
    clearInterval(dispatcher);
    clearInterval(heartbeat);
    tasks.forEach((t) => t.stop());
  };
}
