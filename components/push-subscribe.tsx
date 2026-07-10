'use client';

/**
 * Web-push opt-in for the current device (UPGRADE_SPEC §8).
 * Hidden entirely when NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured;
 * shows tr.push.unsupported when the browser lacks the Push API (e.g.
 * iOS Safari before the PWA is installed — hence the install hint).
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import { clientEnv } from '@/lib/env';
import {
  savePushSubscription,
  removePushSubscription,
} from '@/lib/actions/push';
import { tr } from '@/lib/i18n/tr';

type PushState = 'checking' | 'unsupported' | 'denied' | 'idle' | 'enabled';

function isSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Convert the base64url VAPID key to the BufferSource subscribe() expects. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function PushSubscribe({ className = '' }: { className?: string }) {
  const vapidKey = clientEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!vapidKey) return;
    let cancelled = false;
    async function detect(): Promise<PushState> {
      if (!isSupported()) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        return sub ? 'enabled' : 'idle';
      } catch {
        return 'idle';
      }
    }
    detect().then((resolved) => {
      if (!cancelled) setState(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [vapidKey]);

  // Feature not configured — render nothing at all.
  if (!vapidKey) return null;

  async function enable() {
    setBusy(true);
    setErr(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle');
        return;
      }
      // SwRegister (root layout) registers /sw.js; re-register is a no-op
      // safety net, then wait until the worker is active.
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!),
      });
      const { keys } = sub.toJSON();
      if (!keys?.p256dh || !keys.auth) throw new Error('missing keys');
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      });
      if (!res.ok) {
        // Keep browser and DB consistent: drop the orphan subscription.
        await sub.unsubscribe().catch(() => {});
        setErr(tr.errors.generic);
        setState('idle');
        return;
      }
      setState('enabled');
    } catch {
      setErr(tr.errors.generic);
      setState('idle');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setErr(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await removePushSubscription({ endpoint });
      }
      setState('idle');
    } catch {
      setErr(tr.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span className="text-xs font-medium text-neutral-400">
        {tr.push.title}
      </span>

      {state === 'unsupported' && (
        <p className="text-xs text-neutral-500">{tr.push.unsupported}</p>
      )}
      {state === 'denied' && (
        <p className="text-xs text-amber-400">{tr.push.denied}</p>
      )}
      {state === 'idle' && (
        <div>
          <Button type="button" onClick={enable} disabled={busy}>
            {busy ? tr.common.processing : tr.push.enable}
          </Button>
        </div>
      )}
      {state === 'enabled' && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-emerald-400">{tr.push.enabled}</span>
          <Button
            type="button"
            variant="ghost"
            onClick={disable}
            disabled={busy}
          >
            {busy ? tr.common.processing : tr.push.disable}
          </Button>
        </div>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}
      <p className="text-[11px] leading-relaxed text-neutral-600">
        {tr.push.installHint}
      </p>
    </div>
  );
}
