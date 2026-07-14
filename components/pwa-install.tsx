'use client';

/**
 * In-app "install to device" affordance for the PWA (manifest lives in
 * app/manifest.ts, service worker registered by SwRegister). Renders a compact
 * glass pill only when the browser has fired `beforeinstallprompt` and the app
 * is not already running standalone — otherwise it renders nothing.
 */

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

import { tr } from '@/lib/i18n/tr';

/** `beforeinstallprompt` is not yet in lib.dom.d.ts — minimal local shape. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayModeStandalone = window.matchMedia?.(
    '(display-mode: standalone)',
  ).matches;
  // iOS Safari exposes standalone on navigator, not via display-mode.
  const iosStandalone = (
    navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return Boolean(displayModeStandalone || iosStandalone);
}

export function PwaInstall({ className = '' }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    if (isStandalone()) return;

    function onBeforeInstallPrompt(e: Event) {
      // Stop Chrome's default mini-infobar so we can trigger the prompt later.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }

    function onAppInstalled() {
      setDeferred(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (!deferred) return null;

  async function install() {
    const evt = deferred;
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    // One-shot: the event can't be reused, so drop it to hide the button.
    setDeferred(null);
  }

  return (
    <button
      type="button"
      onClick={install}
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.08] ${className}`}
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {tr.pwa.install}
    </button>
  );
}
