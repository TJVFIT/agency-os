'use client';

/**
 * Scrollable assistant thread. Presentational — messages arrive via props
 * (the root owns data + realtime wiring). Renders the four list states:
 * skeletons while history loads, the orb empty state with suggestion chips,
 * the grouped message flow with an optional thinking row, and the in-thread
 * error bubble with retry.
 *
 * Scroll behavior: pinned-to-bottom auto-follow. The pin releases when the
 * user scrolls up past a small threshold and re-engages when they return to
 * the tail; a ResizeObserver keeps the tail visible while the typewriter
 * grows the last bubble.
 */

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

import {
  AssistantEmptyState,
  AssistantErrorBubble,
  AssistantThinking,
  MessageSkeleton,
} from './assistant-bits';
import {
  AssistantMessageBubble,
  type AssistantChatMessage,
} from './message-bubble';

/** Same-author messages within this window collapse into one group. */
const GROUP_WINDOW_MS = 2 * 60 * 1000;
/** How close to the tail (px) still counts as "pinned to bottom". */
const PIN_THRESHOLD_PX = 80;

function sameGroup(a: AssistantChatMessage, b: AssistantChatMessage) {
  return (
    a.role === b.role &&
    Math.abs(
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ) <= GROUP_WINDOW_MS
  );
}

export function AssistantMessageList({
  messages,
  loading = false,
  pending = false,
  error = null,
  revealId = null,
  onRetry,
  onSuggest,
  className = '',
}: {
  messages: AssistantChatMessage[];
  /** History still being fetched — render skeleton bubbles. */
  loading?: boolean;
  /** A reply is being drafted — render the thinking row at the tail. */
  pending?: boolean;
  /** Failure text for the tail error bubble (send failed / reply timeout). */
  error?: string | null;
  /** Message id that should typewriter-reveal (freshest live reply). */
  revealId?: string | null;
  onRetry?: () => void;
  /** Empty-state suggestion chips send through this. */
  onSuggest?: (body: string) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const reduce = useReducedMotion();

  // New rows / state changes: follow the tail while pinned.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [messages.length, pending, error, loading, reduce]);

  // Typewriter growth: keep the tail visible without smooth-scroll jitter.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading || typeof ResizeObserver === 'undefined') return;
    const inner = el.firstElementChild;
    if (!inner) return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, [loading]);

  const empty = messages.length === 0 && !pending && !error;

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const el = event.currentTarget;
        pinnedRef.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
      }}
      className={`overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 ${className}`}
    >
      <div className="min-h-full">
        {loading ? (
          <MessageSkeleton />
        ) : empty ? (
          <AssistantEmptyState onSuggest={onSuggest} />
        ) : (
          <ol className="m-0 list-none p-0">
            {messages.map((message, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const groupStart = !prev || !sameGroup(prev, message);
              const groupEnd = !next || !sameGroup(message, next);
              return (
                <li
                  key={message.id}
                  className={`min-w-0 ${i === 0 ? '' : groupStart ? 'mt-5' : 'mt-1.5'}`}
                >
                  <AssistantMessageBubble
                    message={message}
                    groupStart={groupStart}
                    groupEnd={groupEnd}
                    reveal={message.id === revealId}
                  />
                </li>
              );
            })}
            {pending && (
              <li className="mt-5 min-w-0">
                <AssistantThinking />
              </li>
            )}
            {error && (
              <li className="mt-5 min-w-0">
                <AssistantErrorBubble text={error} onRetry={onRetry} />
              </li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
