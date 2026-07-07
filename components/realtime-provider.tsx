'use client';

/**
 * One Supabase Realtime channel per logged-in session (SPEC §13):
 * activity_log INSERT, cards changes, ai_jobs UPDATE. Components subscribe
 * through useRealtimeEvent — no extra channels, debounce at the consumer.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { ActivityEntry, AiJob, Card } from '@/lib/db/types';

export type RealtimeEvents = {
  'activity.insert': ActivityEntry;
  'cards.change': {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Card | null;
    old: Partial<Card> | null;
  };
  'ai_jobs.update': AiJob;
};

type Handler<E extends keyof RealtimeEvents> = (
  payload: RealtimeEvents[E],
) => void;

interface RealtimeBus {
  subscribe<E extends keyof RealtimeEvents>(
    event: E,
    handler: Handler<E>,
  ): () => void;
}

const RealtimeContext = createContext<RealtimeBus | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef(
    new Map<string, Set<(payload: unknown) => void>>(),
  );

  const emit = useCallback((event: string, payload: unknown) => {
    handlersRef.current.get(event)?.forEach((h) => h(payload));
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel('app-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload) => emit('activity.insert', payload.new),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cards' },
        (payload) =>
          emit('cards.change', {
            eventType: payload.eventType,
            new: Object.keys(payload.new ?? {}).length ? payload.new : null,
            old: payload.old ?? null,
          }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ai_jobs' },
        (payload) => emit('ai_jobs.update', payload.new),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [emit]);

  const bus = useRef<RealtimeBus>({
    subscribe(event, handler) {
      const map = handlersRef.current;
      if (!map.has(event)) map.set(event, new Set());
      const set = map.get(event)!;
      set.add(handler as (payload: unknown) => void);
      return () => set.delete(handler as (payload: unknown) => void);
    },
  }).current;

  return (
    <RealtimeContext.Provider value={bus}>{children}</RealtimeContext.Provider>
  );
}

/** Subscribe to a realtime event for the lifetime of the component. */
export function useRealtimeEvent<E extends keyof RealtimeEvents>(
  event: E,
  handler: Handler<E>,
) {
  const bus = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!bus) return;
    return bus.subscribe(event, (payload) => handlerRef.current(payload));
  }, [bus, event]);
}
