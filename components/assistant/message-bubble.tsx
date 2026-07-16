'use client';

/**
 * One assistant-thread message (Ethereal Glass). User turns sit right in an
 * indigo-tinted glass chip; assistant turns sit left on neutral glass, both
 * with the inset top highlight. Consecutive same-author messages group:
 * the author label renders only on the first of a group and the tucked
 * corner only on the last. Timestamps reveal on row hover. A freshly
 * streamed assistant reply gets a typewriter reveal (~18ms/char, click to
 * skip, disabled under reduced motion).
 */

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import { fmtIstanbulTime } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { AssistantMessage } from '@/lib/db/types';

/** Minimal message shape — DB rows and optimistic inserts both satisfy it. */
export type AssistantChatMessage = Pick<
  AssistantMessage,
  'id' | 'role' | 'body' | 'created_at'
>;

const TYPE_TICK_MS = 18;
/** Long replies reveal in at most ~7s (larger slices per tick). */
const TYPE_MAX_TICKS = 400;

/**
 * Client-side typewriter: slices `body` forward every tick while `active`.
 * Returns the visible text, whether the reveal finished, and a skip fn.
 */
function useTypewriter(
  body: string,
  active: boolean,
): { text: string; done: boolean; skip: () => void } {
  const reduce = useReducedMotion();
  const animate = active && !reduce;
  const [chars, setChars] = useState(() => (animate ? 0 : body.length));
  const done = chars >= body.length;

  useEffect(() => {
    if (!animate || done) return;
    const step = Math.max(1, Math.ceil(body.length / TYPE_MAX_TICKS));
    const timer = setInterval(
      () => setChars((c) => Math.min(body.length, c + step)),
      TYPE_TICK_MS,
    );
    return () => clearInterval(timer);
  }, [animate, done, body.length]);

  return {
    text: done ? body : body.slice(0, chars),
    done,
    skip: () => setChars(body.length),
  };
}

const BUBBLE = {
  user: 'border border-indigo-300/25 bg-indigo-400/[0.1] text-indigo-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
  assistant:
    'border border-white/[0.08] bg-white/[0.03] text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
} as const;

export function AssistantMessageBubble({
  message,
  groupStart = true,
  groupEnd = true,
  reveal = false,
}: {
  message: AssistantChatMessage;
  /** First message of a same-author run — renders the author label. */
  groupStart?: boolean;
  /** Last message of a same-author run — gets the tucked corner. */
  groupEnd?: boolean;
  /** Typewriter-reveal the body (fresh assistant replies only). */
  reveal?: boolean;
}) {
  const mine = message.role === 'user';
  const { text, done, skip } = useTypewriter(message.body, reveal);

  const corner = groupEnd ? (mine ? 'rounded-br-md' : 'rounded-bl-md') : '';

  return (
    <div
      className={`group/msg flex w-full ${mine ? 'justify-end' : 'justify-start'}`}
    >
      <div className="min-w-0 max-w-[85%]">
        {groupStart && (
          <p
            className={`mb-1 text-[11px] font-medium uppercase tracking-[0.08em] ${
              mine
                ? 'text-right text-indigo-300/70'
                : 'text-left text-neutral-500'
            }`}
          >
            {mine ? tr.assistant.you : tr.assistant.title}
          </p>
        )}
        <div
          className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <div
            onClick={reveal && !done ? skip : undefined}
            className={`min-w-0 whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${corner} ${
              BUBBLE[mine ? 'user' : 'assistant']
            } ${reveal && !done ? 'cursor-pointer' : ''}`}
          >
            {text}
            {reveal && !done && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse rounded-full bg-indigo-200/80 align-middle"
              />
            )}
          </div>
          {/* Hover-revealed timestamp, tucked beside the bubble tail. */}
          <time
            dateTime={message.created_at}
            className="shrink-0 pb-0.5 text-[10px] tabular-nums text-neutral-600 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100"
          >
            {fmtIstanbulTime(message.created_at)}
          </time>
        </div>
      </div>
    </div>
  );
}
