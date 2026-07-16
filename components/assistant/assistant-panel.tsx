'use client';

/**
 * Assistant chat sheet (Ethereal Glass): right-side glass sheet on desktop
 * (~400px, full height, gradient hairline top edge), bottom sheet on mobile.
 * Spring entrance via framer-motion — x-offset on desktop, y-offset on
 * mobile, fade both ways; a dim backdrop closes on click, Escape closes too.
 *
 * Render inside <AnimatePresence> so the exit animation plays:
 *   <AnimatePresence>{open && <AssistantPanel … />}</AnimatePresence>
 */

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

import { tr } from '@/lib/i18n/tr';

import { AssistantOrb } from './assistant-bits';
import { AssistantComposer } from './composer';
import { AssistantMessageList } from './message-list';
import type { AssistantChatMessage } from './message-bubble';

/** Tracks the `sm` breakpoint — picks the slide-in axis for the sheet. */
function useIsDesktop() {
  const [desktop, setDesktop] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 640px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

const SPRING = { type: 'spring', stiffness: 360, damping: 34 } as const;

export function AssistantPanel({
  messages,
  loading = false,
  pending = false,
  error = null,
  note = null,
  revealId = null,
  onSend,
  onRetry,
  onClear,
  onClose,
}: {
  messages: AssistantChatMessage[];
  loading?: boolean;
  pending?: boolean;
  error?: string | null;
  /** Quiet one-line confirmation above the composer (e.g. thread cleared). */
  note?: string | null;
  revealId?: string | null;
  onSend: (body: string) => void | Promise<void>;
  onRetry?: () => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const desktop = useIsDesktop();
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const offset = reduce ? {} : desktop ? { x: 32 } : { y: 48 };
  const exitOffset = reduce ? {} : desktop ? { x: 24 } : { y: 32 };

  return (
    <>
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] sm:bg-black/25 sm:backdrop-blur-none"
      />
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label={tr.assistant.title}
        initial={{ opacity: 0, ...offset }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, ...exitOffset, transition: { duration: 0.2 } }}
        transition={SPRING}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-white/[0.08] bg-[#0a0a0c]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_64px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:inset-x-auto sm:inset-y-3 sm:right-3 sm:h-auto sm:w-[400px] sm:max-w-[calc(100vw-24px)] sm:rounded-2xl"
      >
        {/* Gradient hairline edge — the indigo signature of the surface. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent"
        />
        {/* Mobile grab handle. */}
        <span
          aria-hidden
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/15 sm:hidden"
        />

        <header className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <AssistantOrb size="sm" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold tracking-tight text-neutral-100">
              {tr.assistant.title}
            </h2>
            <p className="truncate text-[11px] leading-4 text-neutral-600">
              {tr.assistant.hint}
            </p>
          </div>
          {onClear && messages.length > 0 && !loading && (
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs text-neutral-500 transition-colors duration-300 hover:bg-white/[0.06] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40"
            >
              {tr.assistant.clear}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={tr.common.close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors duration-300 hover:bg-white/[0.06] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <AssistantMessageList
          messages={messages}
          loading={loading}
          pending={pending}
          error={error}
          revealId={revealId}
          onRetry={onRetry}
          onSuggest={onSend}
          className="min-h-0 flex-1"
        />

        <footer className="shrink-0 border-t border-white/[0.06] px-3 py-3 sm:px-4">
          {note && (
            <p
              role="status"
              className="mb-2 text-center text-[11px] text-neutral-500"
            >
              {note}
            </p>
          )}
          <AssistantComposer
            onSend={onSend}
            pending={pending}
            disabled={loading}
            autoFocus={desktop}
          />
        </footer>
      </motion.section>
    </>
  );
}
