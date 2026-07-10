'use client';

/**
 * Demo workspace store — the credential-free walkthrough persists everything
 * the visitor enters (their company, social accounts, content, schedule) in
 * localStorage, so the demo behaves like a real single-user workspace during
 * a client presentation. No backend, no auth; safe to delete with /preview.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { CardWithClient } from '@/lib/db/queries';
import type { Platform } from '@/lib/db/types';
import type { CardStatus } from '@/lib/status';

const STORAGE_KEY = 'agencyos-demo-v1';

export interface DemoAccount {
  platform: Platform;
  handle: string;
}

export interface StoreClient {
  id: string;
  name: string;
  industry: string;
  district: string;
  colors: { primary: string };
  langs: string[];
  accounts: DemoAccount[];
}

export type StoreCardType = 'post' | 'reel' | 'story' | 'other';

export interface StoreCard {
  id: string;
  clientId: string;
  title: string;
  type: StoreCardType;
  status: CardStatus;
  scheduledAt: string | null; // ISO — set from the Takvim schedule dialog
  dueAt: string | null;
  platforms: string[];
}

export interface FeedEntry {
  id: string;
  text: string;
  at: string;
}

interface DemoState {
  clients: StoreClient[];
  cards: StoreCard[];
  feed: FeedEntry[];
}

const EMPTY: DemoState = { clients: [], cards: [], feed: [] };

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DemoStore extends DemoState {
  hydrated: boolean;
  addClient(input: Omit<StoreClient, 'id'>): StoreClient;
  updateClient(id: string, patch: Partial<Omit<StoreClient, 'id'>>): void;
  removeClient(id: string): void;
  addAccount(clientId: string, account: DemoAccount): void;
  removeAccount(clientId: string, platform: Platform, handle: string): void;
  addCard(
    input: Omit<StoreCard, 'id' | 'scheduledAt'> & {
      scheduledAt?: string | null;
    },
  ): StoreCard;
  updateCard(id: string, patch: Partial<Omit<StoreCard, 'id'>>): void;
  scheduleCard(id: string, isoDateTime: string, platforms: string[]): void;
  moveCard(id: string, status: CardStatus): void;
  removeCard(id: string): void;
  log(text: string): void;
  resetAll(): void;
}

const Ctx = createContext<DemoStore | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration on mount (SSR-safe pattern)
      if (raw) setState({ ...EMPTY, ...(JSON.parse(raw) as DemoState) });
    } catch {
      /* corrupted storage — start clean */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full/blocked — demo keeps working in memory */
    }
  }, [state, hydrated]);

  const log = useCallback((text: string) => {
    setState((s) => ({
      ...s,
      feed: [
        { id: uid(), text, at: new Date().toISOString() },
        ...s.feed,
      ].slice(0, 60),
    }));
  }, []);

  const store = useMemo<DemoStore>(
    () => ({
      ...state,
      hydrated,
      addClient(input) {
        const client: StoreClient = { ...input, id: uid() };
        setState((s) => ({
          ...s,
          clients: [...s.clients, client],
          feed: [
            {
              id: uid(),
              text: `"${client.name}" çalışma alanına eklendi 🎉`,
              at: new Date().toISOString(),
            },
            ...s.feed,
          ].slice(0, 60),
        }));
        return client;
      },
      updateClient(id, patch) {
        setState((s) => ({
          ...s,
          clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
      },
      removeClient(id) {
        setState((s) => ({
          ...s,
          clients: s.clients.filter((c) => c.id !== id),
          cards: s.cards.filter((c) => c.clientId !== id),
        }));
      },
      addAccount(clientId, account) {
        setState((s) => ({
          ...s,
          clients: s.clients.map((c) =>
            c.id === clientId
              ? { ...c, accounts: [...c.accounts, account] }
              : c,
          ),
        }));
      },
      removeAccount(clientId, platform, handle) {
        setState((s) => ({
          ...s,
          clients: s.clients.map((c) =>
            c.id === clientId
              ? {
                  ...c,
                  accounts: c.accounts.filter(
                    (a) => !(a.platform === platform && a.handle === handle),
                  ),
                }
              : c,
          ),
        }));
      },
      addCard(input) {
        const card: StoreCard = {
          scheduledAt: null,
          ...input,
          id: uid(),
        };
        setState((s) => ({
          ...s,
          cards: [...s.cards, card],
          feed: [
            {
              id: uid(),
              text: `"${card.title}" kartı oluşturuldu`,
              at: new Date().toISOString(),
            },
            ...s.feed,
          ].slice(0, 60),
        }));
        return card;
      },
      updateCard(id, patch) {
        setState((s) => ({
          ...s,
          cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
      },
      scheduleCard(id, isoDateTime, platforms) {
        setState((s) => {
          const card = s.cards.find((c) => c.id === id);
          return {
            ...s,
            cards: s.cards.map((c) =>
              c.id === id
                ? {
                    ...c,
                    scheduledAt: isoDateTime,
                    platforms,
                    status: 'scheduled',
                  }
                : c,
            ),
            feed: card
              ? [
                  {
                    id: uid(),
                    text: `"${card.title}" yayın zamanı ayarlandı 📅`,
                    at: new Date().toISOString(),
                  },
                  ...s.feed,
                ].slice(0, 60)
              : s.feed,
          };
        });
      },
      moveCard(id, status) {
        setState((s) => ({
          ...s,
          cards: s.cards.map((c) => (c.id === id ? { ...c, status } : c)),
        }));
      },
      removeCard(id) {
        setState((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id) }));
      },
      log,
      resetAll() {
        setState(EMPTY);
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* noop */
        }
      },
    }),
    [state, hydrated, log],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useDemoStore(): DemoStore {
  const store = useContext(Ctx);
  if (!store)
    throw new Error('useDemoStore must be used inside DemoStoreProvider');
  return store;
}

/** Adapt store rows to the shape shared components (CardTile) expect. */
export function toCardWithClient(
  card: StoreCard,
  client: StoreClient | undefined,
): CardWithClient {
  return {
    id: card.id,
    client_id: card.clientId,
    type: card.type,
    title: card.title,
    status: card.status,
    assignee: null,
    due_at: card.dueAt,
    scheduled_at: card.scheduledAt,
    platforms: card.platforms,
    priority: 3,
    tags: [],
    created_by: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    clients: client
      ? {
          id: client.id,
          name: client.name,
          slug: client.id,
          langs: client.langs,
          colors: client.colors,
        }
      : null,
  } as unknown as CardWithClient;
}
