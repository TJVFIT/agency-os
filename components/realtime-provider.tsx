'use client';

/**
 * One Supabase Realtime channel per logged-in session (SPEC §13):
 * activity_log INSERT, cards changes, ai_jobs UPDATE. Components subscribe
 * through useRealtimeEvent — no extra channels, debounce at the consumer.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { ActivityEntry, AiJob, Card, ClientMessage } from '@/lib/db/types';

export type RealtimeEvents = {
  'activity.insert': ActivityEntry;
  'cards.change': {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Card | null;
    old: Partial<Card> | null;
  };
  'ai_jobs.update': AiJob;
  'client_messages.insert': ClientMessage;
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

interface InternalBus extends RealtimeBus {
  emit(event: string, payload: unknown): void;
}

const RealtimeContext = createContext<RealtimeBus | null>(null);

/** A stable event bus backed by a closure-local handler map (no refs). */
function createRealtimeBus(): InternalBus {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  return {
    emit(event, payload) {
      handlers.get(event)?.forEach((h) => h(payload));
    },
    subscribe(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      const set = handlers.get(event)!;
      set.add(handler as (payload: unknown) => void);
      return () => set.delete(handler as (payload: unknown) => void);
    },
  };
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [bus] = useState(createRealtimeBus);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel('app-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload) => bus.emit('activity.insert', payload.new),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cards' },
        (payload) =>
          bus.emit('cards.change', {
            eventType: payload.eventType,
            new: Object.keys(payload.new ?? {}).length ? payload.new : null,
            old: payload.old ?? null,
          }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ai_jobs' },
        (payload) => bus.emit('ai_jobs.update', payload.new),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'client_messages' },
        (payload) => bus.emit('client_messages.insert', payload.new),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bus]);

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
  // Update the ref in an effect (not during render) so the subscription
  // always calls the latest handler without re-subscribing each render.
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!bus) return;
    return bus.subscribe(event, (payload) => handlerRef.current(payload));
  }, [bus, event]);
}
