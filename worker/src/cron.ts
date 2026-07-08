/**
 * Scheduled jobs (SPEC §11), Europe/Istanbul. The publish dispatcher runs on
 * a 60s interval; the rest are node-cron. Each is idempotent/deduped so a
 * double-fire or restart can't double-post or spam idea cards.
 */

import cron from 'node-cron';

import { db, logActivity } from './supabase';
import { notifyManagers } from './telegram';
import { log } from './log';
import { workerEnv } from './env';

const TZ = 'Europe/Istanbul';

// ---------- publish dispatcher (every 60s) ----------
async function dispatchScheduled(): Promise<void> {
  const now = new Date().toISOString();
  const { data: due } = await db()
    .from('cards')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);
  if (!due?.length) return;

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

    await db()
      .from('ai_jobs')
      .insert({ kind: 'publish', payload: { card_id: card.id } });
    log.info({ card_id: card.id }, 'publish enqueued');
  }
}

// ---------- Monday 09:00 planner ----------
async function runPlanner(): Promise<void> {
  const weekStart = nextMondayIso();
  const { data: clients } = await db()
    .from('clients')
    .select('id')
    .eq('active', true);
  for (const client of clients ?? []) {
    const { count } = await db()
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('status', 'idea')
      .neq('status', 'archived');
    if ((count ?? 0) >= 5) continue; // SPEC: skip if ≥5 ideas already
    await db()
      .from('ai_jobs')
      .insert({
        kind: 'plan',
        payload: { client_id: client.id, week_start: weekStart },
      });
  }
  log.info('weekly planner enqueued');
}

// ---------- Friday 17:00 reports ----------
async function runReports(): Promise<void> {
  const weekStart = thisMondayIso();
  const { data: clients } = await db()
    .from('clients')
    .select('id')
    .eq('active', true);
  for (const client of clients ?? []) {
    const { data: report } = await db()
      .from('reports')
      .select('metrics')
      .eq('client_id', client.id)
      .eq('week_start', weekStart)
      .single();
    await db()
      .from('ai_jobs')
      .insert({
        kind: 'report',
        payload: {
          client_id: client.id,
          week_start: weekStart,
          metrics: report?.metrics ?? {},
        },
      });
  }
  await notifyManagers('📊 Haftalık raporlar hazırlanıyor.').catch(() => {});
}

// ---------- daily 10:00 gap radar ----------
async function runGapRadar(): Promise<void> {
  const { data: clients } = await db()
    .from('clients')
    .select('id, name')
    .eq('active', true);
  const in5 = new Date(Date.now() + 5 * 864e5).toISOString();
  for (const client of clients ?? []) {
    const { count } = await db()
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .in('status', ['scheduled', 'approved'])
      .lte('scheduled_at', in5);
    if ((count ?? 0) === 0) {
      await notifyManagers(
        `🚩 ${client.name}: önümüzdeki 5 günde planlı içerik yok.`,
      ).catch(() => {});
    }
  }
}

// ---------- daily 03:00 retention pruning (SPEC §3) ----------
async function runRetention(): Promise<void> {
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 864e5).toISOString();
  await db().from('activity_log').delete().lt('created_at', yearAgo);
  await db()
    .from('ai_jobs')
    .delete()
    .in('status', ['done', 'error'])
    .lt('updated_at', sixtyDaysAgo);
  log.info('retention pruning done');
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
