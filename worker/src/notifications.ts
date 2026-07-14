/**
 * Notification dispatcher (SPEC §5/§9, UPGRADE_SPEC §8). The worker tails
 * activity_log and turns events into notifications for the relevant people:
 * new assignee, "waiting on you" (approval needed), approval granted/rejected,
 * publish success/failure, plus the v2 kinds (shoots, ideas, availability,
 * suggestions, compliance blocks, overdue payments). Every message fans out
 * to Telegram AND web-push — both channels are best-effort and no-op when
 * unconfigured, so the loop runs if at least one of them is available.
 *
 * Poll-based (matches the worker's model, no websockets): it tracks the last
 * activity_log id and dispatches new rows every few seconds. On boot it
 * starts from the current max id so history isn't replayed.
 */

import { formatInTimeZone } from 'date-fns-tz';

import type { ActivityEntry } from '../../lib/db/types';
import { db } from './supabase';
import { log } from './log';
import {
  notifyManagers,
  notifyManagersOnly,
  notifyUser,
  sendApprovalRequest,
  telegramConfigured,
} from './telegram';
import { pushConfigured, sendPushToManagers, sendPushToProfile } from './push';

const POLL_MS = 5000;
const TZ = 'Europe/Istanbul';
const PUSH_TITLE = 'Agency OS';

async function cardMeta(cardId: string) {
  const { data } = await db()
    .from('cards')
    .select('title, assignee, client_id, clients(langs)')
    .eq('id', cardId)
    .single();
  const langs = (data?.clients as { langs: string[] } | null)?.langs ?? ['tr'];
  return {
    title: data?.title ?? '',
    assignee: data?.assignee ?? null,
    langs,
  };
}

/** Telegram + push to one profile. Never throws (both channels swallow). */
async function notifyUserAll(
  profileId: string,
  text: string,
  url = '/',
): Promise<void> {
  await notifyUser(profileId, text).catch(() => {});
  await sendPushToProfile(profileId, { title: PUSH_TITLE, body: text, url });
}

/** Telegram + push to admins + managers. Never throws. */
async function notifyManagersAll(text: string, url = '/'): Promise<void> {
  await notifyManagers(text).catch(() => {});
  await sendPushToManagers({ title: PUSH_TITLE, body: text, url });
}

async function dispatch(row: ActivityEntry): Promise<void> {
  const detail = (row.detail ?? {}) as Record<string, unknown>;

  switch (row.action) {
    case 'card.assigned': {
      const assignee = detail.assignee as string | undefined;
      if (assignee && row.card_id) {
        const { title } = await cardMeta(row.card_id);
        await notifyUserAll(
          assignee,
          `📌 Yeni kart sana atandı: ${title}`,
          `/cards/${row.card_id}`,
        );
      }
      break;
    }
    case 'card.status_changed': {
      if (!row.card_id) break;
      const to = detail.to as string;
      const { title, assignee, langs } = await cardMeta(row.card_id);
      // Waiting on managers: translated (multi-lang) or visual_ready (single).
      if (
        to === 'translated' ||
        (to === 'visual_ready' && langs.length === 1)
      ) {
        await sendApprovalRequest(row.card_id, title);
        await sendPushToManagers({
          title: PUSH_TITLE,
          body: `Onay bekliyor: ${title}`,
          url: `/cards/${row.card_id}`,
        });
      } else if (to === 'visual_ready' && langs.length > 1) {
        // Multi-lang: visuals are ready but the `translated` step is still
        // pending before approval — flag it to whoever handles translation.
        const url = `/cards/${row.card_id}`;
        const msg = `🌐 Çeviri bekliyor: ${title}`;
        if (assignee) await notifyUserAll(assignee, msg, url);
        else await notifyManagersAll(msg, url);
      } else if (to === 'approved' && assignee) {
        await notifyUserAll(
          assignee,
          `✅ Onaylandı, planlanabilir: ${title}`,
          `/cards/${row.card_id}`,
        );
      }
      break;
    }
    case 'approval.granted': {
      if (!row.card_id) break;
      const { title, assignee } = await cardMeta(row.card_id);
      const url = `/cards/${row.card_id}`;
      await notifyManagersAll(`✅ Müşteri onayladı: ${title}`, url);
      if (assignee)
        await notifyUserAll(assignee, `✅ Müşteri onayladı: ${title}`, url);
      break;
    }
    case 'approval.rejected': {
      if (!row.card_id) break;
      const { title, assignee } = await cardMeta(row.card_id);
      const comment = (detail.comment as string) || '';
      const msg = `↩️ Müşteri reddetti: ${title}${comment ? ` — "${comment}"` : ''}`;
      const url = `/cards/${row.card_id}`;
      await notifyManagersAll(msg, url);
      if (assignee) await notifyUserAll(assignee, msg, url);
      break;
    }
    case 'publish.success': {
      if (!row.card_id) break;
      const { title } = await cardMeta(row.card_id);
      await notifyManagersAll(
        `🎉 Yayınlandı: ${title}`,
        `/cards/${row.card_id}`,
      );
      break;
    }
    case 'card.rejected': {
      // Manager rejected via the Telegram inline button (telegram.ts logs this
      // with the one-line reason). Notify the card owner + managers.
      if (!row.card_id) break;
      const { title, assignee } = await cardMeta(row.card_id);
      const reason = (detail.reason as string) || '';
      const msg = `↩️ Reddedildi, taslağa döndü: ${title}${reason ? ` — "${reason}"` : ''}`;
      const url = `/cards/${row.card_id}`;
      await notifyManagersAll(msg, url);
      if (assignee) await notifyUserAll(assignee, msg, url);
      break;
    }
    case 'publish.failed': {
      if (!row.card_id) break;
      const { title } = await cardMeta(row.card_id);
      // Terminal publish failures are already Telegram-alerted to admins by
      // queue.failJob (notifyAdmins). Alert managers (non-admins) here so the
      // same admin isn't pinged twice; push covers everyone with the card link.
      const msg = `⚠️ Yayınlama başarısız: ${title}`;
      const url = `/cards/${row.card_id}`;
      await notifyManagersOnly(msg).catch(() => {});
      await sendPushToManagers({ title: PUSH_TITLE, body: msg, url });
      break;
    }
    case 'publish.blocked': {
      // A due card was stopped before publishing — cause is in detail.reason
      // ('no_approval') or detail.issues (compliance). Label accurately.
      if (!row.card_id) break;
      const { title } = await cardMeta(row.card_id);
      const url = `/cards/${row.card_id}`;
      if (detail.reason === 'no_approval') {
        await notifyManagersAll(
          `⚠️ Yayın engellendi: ${title} — onay kaydı yok, kart planlıda takıldı.`,
          url,
        );
        break;
      }
      const issues = Array.isArray(detail.issues)
        ? (detail.issues as { code?: string }[])
            .map((i) => i.code)
            .filter(Boolean)
            .join(', ')
        : '';
      await notifyManagersAll(
        `⛔ Uygunluk kontrolü yayını durdurdu: ${title}${issues ? ` (${issues})` : ''}`,
        url,
      );
      break;
    }
    case 'shoot.status_changed': {
      const to = detail.to as string;
      const shootId = detail.shoot_id as string | undefined;
      const title = (detail.title as string) ?? '';
      if (to === 'confirmed' && shootId) {
        // Brief goes to the assigned crew (UPGRADE_SPEC §3).
        const { data: shoot } = await db()
          .from('shoots')
          .select('crew, starts_at')
          .eq('id', shootId)
          .single();
        if (!shoot) break;
        const when = formatInTimeZone(
          new Date(shoot.starts_at),
          TZ,
          'dd.MM HH:mm',
        );
        for (const memberId of shoot.crew ?? []) {
          await notifyUserAll(
            memberId,
            `🎬 Çekim onaylandı: ${title} — ${when}. Brif: /production`,
            '/production',
          );
        }
      } else if (to === 'done') {
        await notifyManagersAll(`✅ Çekim tamamlandı: ${title}`, '/production');
      }
      break;
    }
    case 'idea.received': {
      const title = (detail.title as string) ?? '';
      await notifyManagersAll(
        `💡 Müşteri yeni fikir gönderdi: "${title}"`,
        row.client_id ? `/clients/${row.client_id}` : '/',
      );
      break;
    }
    case 'availability.received': {
      await notifyManagersAll(
        '📅 Müşteri müsaitlik bildirdi.',
        row.client_id ? `/clients/${row.client_id}` : '/production',
      );
      break;
    }
    case 'suggestion.created': {
      // Missing-work findings are batched: the detector cron sends one
      // summary itself — skip per-row pings to avoid spam.
      if (detail.batched === true) break;
      const title = (detail.title as string) ?? '';
      await notifyManagersAll(`💡 Sistem önerisi: ${title}`, '/dashboard');
      break;
    }
    case 'payment.status_changed': {
      if ((detail.to as string) !== 'overdue') break;
      const title = (detail.title as string) ?? '';
      await notifyManagersAll(`⚠️ Ödeme gecikti: ${title}`, '/finance');
      break;
    }
    case 'message.sent': {
      // Only client-sent messages ping the team; team sends reach the client
      // when they next open the portal (no push channel for portal visitors).
      if ((detail.sender as string) !== 'client') break;
      const preview = (detail.preview as string) ?? '';
      await notifyManagersAll(
        `💬 Müşteri mesajı: "${preview}"`,
        row.client_id ? `/clients/${row.client_id}` : '/',
      );
      break;
    }
    case 'asset.created': {
      // Team uploads are self-evident; only portal (client) uploads ping.
      if ((detail.source as string) !== 'client') break;
      const kind = (detail.kind as string) === 'video' ? 'video' : 'görsel';
      await notifyManagersAll(
        `📎 Müşteri yeni ${kind} yükledi.`,
        row.client_id ? `/clients/${row.client_id}` : '/assets',
      );
      break;
    }
    case 'ai.edit_video_done':
    case 'ai.edit_photo_done': {
      const note = (detail.note as string) ?? '';
      await notifyManagersAll(
        `✨ AI düzenleme hazır${note ? `: ${note}` : ''}`,
        '/assets',
      );
      break;
    }
    default:
      break;
  }
}

export function startNotificationLoop(): () => void {
  if (!telegramConfigured() && !pushConfigured()) {
    log.info('notification loop disabled (no telegram token, no VAPID keys)');
    return () => {};
  }

  let lastId = 0;
  let initialized = false;
  let running = false;
  let stopped = false;

  // First successful pass seeds the cursor at max(id) so history isn't
  // replayed. If the seed query ERRORS we must NOT fall back to 0 — that would
  // replay the entire activity_log as fresh notifications. Instead stay
  // uninitialized (cursor untouched, nothing dispatched) and retry next tick.
  const seedCursor = async (): Promise<boolean> => {
    const { data, error } = await db()
      .from('activity_log')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      log.warn({ err: error.message }, 'notification cursor seed failed');
      return false;
    }
    lastId = data?.id ?? 0;
    initialized = true;
    log.info({ lastId }, 'notification loop started');
    return true;
  };

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      if (!initialized) {
        // Seed (or retry seeding) the cursor; never dispatch on this pass.
        await seedCursor();
        return;
      }
      const { data: rows, error } = await db()
        .from('activity_log')
        .select('*')
        .gt('id', lastId)
        .order('id', { ascending: true })
        .limit(50);
      if (error) {
        // Keep the cursor where it is and try again next tick — no flood.
        log.warn({ err: error.message }, 'notification fetch failed');
        return;
      }
      for (const row of (rows ?? []) as ActivityEntry[]) {
        lastId = Math.max(lastId, row.id);
        try {
          await dispatch(row);
        } catch (err) {
          log.warn(
            { err: String(err), action: row.action },
            'notify dispatch failed',
          );
        }
      }
    } catch (err) {
      log.error({ err: String(err) }, 'notification tick error');
    } finally {
      running = false;
    }
  };

  const timer: ReturnType<typeof setInterval> = setInterval(tick, POLL_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
