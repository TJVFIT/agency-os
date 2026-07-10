/**
 * Web-push sender (UPGRADE_SPEC §8). Best-effort by design: every helper
 * swallows its own errors — push is a secondary channel next to Telegram and
 * must never break a cron tick or the notification loop. No-ops cleanly when
 * the VAPID keys aren't configured. Subscriptions that the push service
 * reports as gone (404/410) are deleted so dead endpoints don't accumulate.
 */

import webpush from 'web-push';

import type { Enums } from '../../lib/db/types';
import { workerEnv } from './env';
import { db } from './supabase';
import { log } from './log';

export interface PushMessage {
  title: string;
  body: string;
  /** App path or absolute URL the service worker opens on click. */
  url?: string;
}

export function pushConfigured(): boolean {
  const env = workerEnv();
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

let vapidReady = false;

function ensureVapid(): boolean {
  if (!pushConfigured()) return false;
  if (!vapidReady) {
    const env = workerEnv();
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      env.VAPID_PRIVATE_KEY!,
    );
    vapidReady = true;
  }
  return true;
}

interface SubRow {
  id: string;
  endpoint: string;
  keys: unknown;
}

async function sendToSubscription(sub: SubRow, payload: string): Promise<void> {
  const keys = (sub.keys ?? {}) as { p256dh?: string; auth?: string };
  if (!keys.p256dh || !keys.auth) return;
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      },
      payload,
    );
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // Subscription expired/unsubscribed — prune it.
      await db().from('push_subscriptions').delete().eq('id', sub.id);
      log.info({ endpoint: sub.endpoint }, 'push sub pruned');
    } else {
      log.warn({ err: String(err), status }, 'push send failed');
    }
  }
}

/** Send a push notification to every subscription of one profile. */
export async function sendPushToProfile(
  profileId: string,
  msg: PushMessage,
): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const { data: subs } = await db()
      .from('push_subscriptions')
      .select('id, endpoint, keys')
      .eq('profile_id', profileId);
    if (!subs?.length) return;
    const payload = JSON.stringify(msg);
    for (const sub of subs) await sendToSubscription(sub, payload);
  } catch (err) {
    log.warn({ err: String(err), profileId }, 'push to profile failed');
  }
}

/** Send a push notification to everyone holding one of the given roles. */
export async function sendPushToRoles(
  roles: Enums<'user_role'>[],
  msg: PushMessage,
): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const { data: profiles } = await db()
      .from('profiles')
      .select('id')
      .in('role', roles);
    for (const p of profiles ?? []) await sendPushToProfile(p.id, msg);
  } catch (err) {
    log.warn({ err: String(err) }, 'push to roles failed');
  }
}

/** Managers = admin + manager (mirrors telegram.ts notifyManagers). */
export async function sendPushToManagers(msg: PushMessage): Promise<void> {
  await sendPushToRoles(['admin', 'manager'], msg);
}
