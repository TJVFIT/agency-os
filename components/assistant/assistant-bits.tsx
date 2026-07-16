'use client';

/**
 * Assistant-private presentational bits (Ethereal Glass): the indigo glass
 * orb, the "Düşünüyor…" shimmer bubble, the empty state with suggestion
 * chips, the in-thread error bubble with retry, and skeleton rows for the
 * history load. No data access — parents pass callbacks down.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

import { tr } from '@/lib/i18n/tr';

/** Glass icon orb — the assistant's visual identity across surfaces. */
export function AssistantOrb({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  const dims =
    size === 'sm' ? 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4' : 'h-11 w-11 [&>svg]:h-5 [&>svg]:w-5';
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border border-indigo-300/25 bg-indigo-400/[0.08] text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_28px_-12px_rgba(0,0,0,0.8)] ${dims} ${className}`}
    >
      <Sparkles strokeWidth={1.75} />
    </span>
  );
}

/** Three softly breathing dots — the decorative half of the thinking row. */
export function ThinkingDots() {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-indigo-200/80"
          animate={reduce ? undefined : { opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.16,
          }}
        />
      ))}
    </span>
  );
}

/** Left-aligned "Düşünüyor…" bubble shown while the worker drafts a reply. */
export function AssistantThinking() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="flex w-full justify-start"
    >
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        <ThinkingDots />
        <span className="text-sm text-neutral-400">{tr.assistant.thinking}</span>
      </div>
    </motion.div>
  );
}

/**
 * In-thread failure bubble (send rejected or the 90s reply window lapsed):
 * red-tint glass, one-line message, retry re-sends the last question.
 */
export function AssistantErrorBubble({
  text,
  onRetry,
}: {
  text: string;
  onRetry?: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="flex w-full justify-start"
    >
      <div
        role="alert"
        className="flex max-w-[85%] flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl rounded-bl-md border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        <span className="min-w-0 break-words text-sm leading-relaxed text-red-200">
          {text}
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-0.5 text-xs font-medium text-red-200 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-red-300/50 hover:bg-red-400/20 hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/40 active:scale-[0.97]"
          >
            {tr.common.retry}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Designed empty thread: orb + greeting + three canned questions as glass
 * chips. Clicking a chip sends it immediately (prefill + send).
 */
export function AssistantEmptyState({
  onSuggest,
}: {
  onSuggest?: (body: string) => void;
}) {
  const reduce = useReducedMotion();
  const suggestions = [
    tr.assistant.suggestToday,
    tr.assistant.suggestCalendar,
    tr.assistant.suggestReel,
  ];
  return (
    <div className="stagger-children flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <AssistantOrb />
      <p className="max-w-[24rem] text-sm leading-snug text-neutral-300">
        {tr.assistant.empty}
      </p>
      <p className="max-w-[22rem] text-[11px] leading-snug text-neutral-600">
        {tr.assistant.hint}
      </p>
      {onSuggest && (
        <div className="mt-3 flex flex-col items-stretch gap-2">
          {suggestions.map((text) => (
            <motion.button
              key={text}
              type="button"
              onClick={() => onSuggest(text)}
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors duration-300 hover:border-indigo-300/30 hover:bg-indigo-400/[0.08] hover:text-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40"
            >
              {text}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Skeleton thread — alternating ghost bubbles while history loads. */
export function MessageSkeleton() {
  const rows: Array<{ mine: boolean; width: string }> = [
    { mine: true, width: 'w-1/2' },
    { mine: false, width: 'w-3/4' },
    { mine: true, width: 'w-2/5' },
    { mine: false, width: 'w-2/3' },
  ];
  return (
    <div aria-hidden className="stagger-children space-y-4">
      {rows.map((row, i) => (
        <div
          key={i}
          className={`flex w-full ${row.mine ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`h-12 max-w-[85%] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03] motion-reduce:animate-none ${
              row.mine ? 'rounded-br-md' : 'rounded-bl-md'
            } ${row.width}`}
          />
        </div>
      ))}
      <span className="sr-only">{tr.common.loading}</span>
    </div>
  );
}
