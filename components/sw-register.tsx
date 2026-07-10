'use client';

import { useEffect } from 'react';

/**
 * Registers the push service worker (/public/sw.js) once on mount.
 * Rendered from the root layout; renders nothing itself.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure (e.g. private mode) — push UI simply won't
      // find a registration; nothing else depends on the SW.
    });
  }, []);

  return null;
}
