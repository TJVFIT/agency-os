'use client';

/**
 * Message composer — auto-growing textarea + circular send button that
 * morphs into a spinner while the enqueued reply is pending. Enter sends,
 * Shift+Enter breaks the line. Purely presentational: the root supplies
 * `onSend` and the pending flag.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

import { Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';

const MAX_HEIGHT_PX = 128;

export function AssistantComposer({
  onSend,
  pending = false,
  disabled = false,
  autoFocus = false,
}: {
  onSend: (body: string) => void | Promise<void>;
  /** A reply is in flight — sending is paused, the button morphs. */
  pending?: boolean;
  /** History still loading — input fully disabled. */
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  const canSend = !disabled && !pending && value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    const body = value.trim();
    setValue('');
    const el = areaRef.current;
    if (el) el.style.height = 'auto';
    void onSend(body);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-end gap-2"
    >
      <Textarea
        ref={areaRef}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={tr.assistant.placeholder}
        aria-label={tr.assistant.placeholder}
        enterKeyHint="send"
        onChange={(event) => {
          setValue(event.target.value);
          // Auto-grow up to four-ish lines, then scroll internally.
          const el = event.target;
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        className="max-h-32 min-w-0 flex-1 resize-none"
      />
      <motion.button
        type="submit"
        aria-label={tr.assistant.send}
        disabled={!canSend}
        whileTap={reduce || !canSend ? undefined : { scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40 disabled:pointer-events-none ${
          pending
            ? 'border border-indigo-300/30 bg-indigo-400/15 text-indigo-200'
            : 'bg-neutral-50 text-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(255,255,255,0.08)] hover:bg-white disabled:opacity-40'
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {pending ? (
            <motion.span
              key="busy"
              initial={reduce ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.15 }}
              className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200/30 border-t-indigo-200 motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <motion.span
              key="send"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              aria-hidden
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </form>
  );
}
