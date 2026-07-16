'use client';

/**
 * Floating assistant launcher — bottom-right glass orb with a slow idle
 * glow pulse, spring hover/press scale, and an unread-reply badge. Sits
 * above the mobile feed toggle (bottom-4 right-4, lg:hidden); on desktop it
 * drops to the corner. Render inside <AnimatePresence> so it cross-fades
 * out while the panel enters.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

import { tr } from '@/lib/i18n/tr';

export function AssistantLauncher({
  onClick,
  unread = 0,
}: {
  onClick: () => void;
  /** Assistant replies that arrived while the panel was closed. */
  unread?: number;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={tr.assistant.open}
      aria-haspopup="dialog"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
      whileHover={reduce ? undefined : { scale: 1.06 }}
      whileTap={reduce ? undefined : { scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-indigo-300/20 bg-[#0c0c0e]/90 text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40 lg:bottom-6 lg:right-6 lg:h-14 lg:w-14"
    >
      {/* Idle glow — a soft indigo breath behind the glass. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 -z-10 rounded-full bg-indigo-500/25 blur-lg"
        animate={reduce ? undefined : { opacity: [0.3, 0.65, 0.3], scale: [1, 1.15, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Sparkles className="h-5 w-5 lg:h-6 lg:w-6" strokeWidth={1.75} aria-hidden />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-400 px-1 text-[10px] font-semibold tabular-nums text-indigo-950 shadow-[0_0_12px_rgba(129,140,248,0.6)]">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </motion.button>
  );
}
