/**
 * Notification dispatcher (SPEC §5/§9). The worker tails activity_log and
 * turns events into Telegram messages for the relevant people: new assignee,
 * "waiting on you" (approval needed), approval granted/rejected, publish
 * success/failure. Poll-based (matches the worker's model, no websockets):
 * it tracks the last activity_log id and dispatches new rows every few
 * seconds. On boot it starts from the current max id so history isn't replayed.
 *
 * No-ops gracefully when Telegram isn't configured (notify* are safe).
 */

import type { ActivityEntry } from '../../lib/db/types';
import { db } from './supabase';
import { log } from './log';
import {
  notifyManagers,
  notifyUser,
  sendApprovalRequest,
  telegramConfigured,
} from './telegram';

const POLL_MS = 5000;

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

async function dispatch(row: ActivityEntry): Promise<void> {
  const detail = (row.detail ?? {}) as Record<string, unknown>;

  switch (row.action) {
    case 'card.assigned': {
      const assignee = detail.assignee as string | undefined;
      if (assignee && row.card_id) {
        const { title } = await cardMeta(row.card_id);
        await notifyUser(assignee, `📌 Yeni kart sana atandı: ${title}`);
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
      } else if (to === 'approved' && assignee) {
        await notifyUser(assignee, `✅ Onaylandı, planlanabilir: ${title}`);
      }
      break;
    }
    case 'approval.granted': {
      if (!row.card_id) break;
      const { title, assignee } = await cardMeta(row.card_id);
      await notifyManagers(`✅ Müşteri onayladı: ${title}`);
      if (assignee) await notifyUser(assignee, `✅ Müşteri onayladı: ${title}`);
      break;
    }
    case 'approval.rejected': {
      if (!row.card_id) break;
      const { title, assignee } = await cardMeta(row.card_id);
      const comment = (detail.comment as string) || '';
      const msg = `↩️ Müşteri reddetti: ${title}${comment ? ` — "${comment}"` : ''}`;
      await notifyManagers(msg);
      if (assignee) await notifyUser(assignee, msg);
      break;
    }
    case 'publish.success': {
      if (!row.card_id) break;
      const { title } = await cardMeta(row.card_id);
      await notifyManagers(`🎉 Yayınlandı: ${title}`);
      break;
    }
    case 'publish.failed': {
      if (!row.card_id) break;
      const { title } = await cardMeta(row.card_id);
      await notifyManagers(`⚠️ Yayınlama başarısız: ${title}`);
      break;
    }
    default:
      break;
  }
}

export function startNotificationLoop(): () => void {
  if (!telegramConfigured()) {
    log.info('notification loop disabled (no telegram token)');
    return () => {};
  }

  let lastId = 0;
  let running = false;
  let stopped = false;

  const init = async () => {
    const { data } = await db()
      .from('activity_log')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    lastId = data?.id ?? 0;
    log.info({ lastId }, 'notification loop started');
  };

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const { data: rows } = await db()
        .from('activity_log')
        .select('*')
        .gt('id', lastId)
        .order('id', { ascending: true })
        .limit(50);
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

  let timer: ReturnType<typeof setInterval> | undefined;
  void init().then(() => {
    if (!stopped) timer = setInterval(tick, POLL_MS);
  });

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}
