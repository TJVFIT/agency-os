'use client';

/**
 * Assistant chat — data owner. Mounts the floating launcher on every
 * authenticated page and the chat sheet when open.
 *
 * Data flow (CLAUDE.md rule 3 — queued AI, UI never blocks):
 *   1. History: fetched lazily on first open with the normal browser client
 *      (RLS `self_read_assistant` scopes rows to the signed-in profile).
 *   2. Send: `sendAssistantMessage` server action inserts the user turn and
 *      enqueues a `chat` ai_job — the message is appended optimistically.
 *   3. Reply: the worker writes the assistant row (service role); it arrives
 *      through the shared realtime channel (`assistant_messages.insert`)
 *      and typewriter-reveals. If the panel is closed, the launcher badge
 *      counts unread replies instead.
 *   4. Fallback: if no reply lands within 90s (or the send fails), an error
 *      bubble with a retry button appears in the thread.
 *
 * "Clear" is a local view reset (RLS has no self-delete on
 * assistant_messages; the worker prunes the table on retention): a cutoff
 * timestamp is stored per profile in localStorage and history fetches only
 * rows after it.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';

import { useRealtimeEvent } from '@/components/realtime-provider';
import { sendAssistantMessage } from '@/lib/actions/assistant';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { tr } from '@/lib/i18n/tr';

import { AssistantLauncher } from './assistant-launcher';
import { AssistantPanel } from './assistant-panel';
import type { AssistantChatMessage } from './message-bubble';

const HISTORY_LIMIT = 50;
const REPLY_TIMEOUT_MS = 90_000;
const NOTE_MS = 2_500;
const TMP_PREFIX = 'tmp-';

const storageKey = (profileId: string) => `assistant.clearedAt.${profileId}`;

/** Insert a realtime row, replacing its optimistic twin when present. */
function upsert(
  prev: AssistantChatMessage[],
  row: AssistantChatMessage,
): AssistantChatMessage[] {
  if (prev.some((m) => m.id === row.id)) return prev;
  if (row.role === 'user') {
    const i = prev.findIndex(
      (m) => m.id.startsWith(TMP_PREFIX) && m.body === row.body,
    );
    if (i >= 0) {
      const next = prev.slice();
      next[i] = row;
      return next;
    }
  }
  return [...prev, row];
}

/** Combine fetched history with rows that arrived live before the fetch. */
function mergeHistory(
  history: AssistantChatMessage[],
  live: AssistantChatMessage[],
): AssistantChatMessage[] {
  const byId = new Map<string, AssistantChatMessage>();
  for (const m of [...history, ...live]) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export function AssistantRoot({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false); // history fetched once
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedBody, setFailedBody] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<string | null>(null);
  const clearedAt = useRef<string | null>(null);

  useEffect(() => {
    clearedAt.current = localStorage.getItem(storageKey(profileId));
  }, [profileId]);

  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );

  const stopReplyTimer = () => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    replyTimer.current = null;
  };

  const startReplyTimer = () => {
    stopReplyTimer();
    replyTimer.current = setTimeout(() => {
      setPending(false);
      setFailedBody(lastSent.current);
      setError(tr.common.error);
    }, REPLY_TIMEOUT_MS);
  };

  // Lazy history fetch on first open (own rows only, RLS-scoped). The
  // timeout defers the state writes out of the effect body (lint rule) —
  // the fetch itself is async anyway.
  useEffect(() => {
    if (!open || opened) return;
    const start = setTimeout(() => {
      setOpened(true);
      setLoading(true);
      let query = createSupabaseBrowser()
        .from('assistant_messages')
        .select('id, role, body, created_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (clearedAt.current) query = query.gt('created_at', clearedAt.current);
      void query.then(({ data }) => {
        // Newest-first page, oldest-first thread.
        setMessages((prev) => mergeHistory((data ?? []).reverse(), prev));
        setLoading(false);
      });
    }, 0);
    return () => clearTimeout(start);
  }, [open, opened, profileId]);

  // Worker replies + user-turn echoes stream in on the shared channel.
  useRealtimeEvent('assistant_messages.insert', (row) => {
    if (row.profile_id !== profileId) return;
    const msg: AssistantChatMessage = {
      id: row.id,
      role: row.role,
      body: row.body,
      created_at: row.created_at,
    };
    if (row.role === 'assistant') {
      stopReplyTimer();
      setPending(false);
      setError(null);
      setFailedBody(null);
      if (open) setRevealId(row.id);
      else setUnread((u) => u + 1);
    }
    setMessages((prev) => upsert(prev, msg));
  });

  const send = async (body: string) => {
    setError(null);
    setFailedBody(null);
    setNote(null);
    const tmp: AssistantChatMessage = {
      id: `${TMP_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tmp]);
    setPending(true);
    lastSent.current = body;
    startReplyTimer();

    let result: Awaited<ReturnType<typeof sendAssistantMessage>>;
    try {
      result = await sendAssistantMessage(body);
    } catch {
      result = { ok: false, error: 'network' };
    }
    if (!result.ok) {
      stopReplyTimer();
      setPending(false);
      setMessages((prev) => prev.filter((m) => m.id !== tmp.id));
      setFailedBody(body);
      setError(tr.common.error);
    }
  };

  const retry = () => {
    if (failedBody) void send(failedBody);
  };

  const clear = () => {
    const cutoff = new Date().toISOString();
    clearedAt.current = cutoff;
    try {
      localStorage.setItem(storageKey(profileId), cutoff);
    } catch {
      // Storage unavailable (private mode) — the in-memory reset still holds.
    }
    stopReplyTimer();
    setMessages([]);
    setPending(false);
    setError(null);
    setFailedBody(null);
    setUnread(0);
    setRevealId(null);
    setNote(tr.assistant.cleared);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {!open && (
          <AssistantLauncher
            key="assistant-launcher"
            unread={unread}
            onClick={() => {
              setUnread(0);
              setOpen(true);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <AssistantPanel
            key="assistant-panel"
            messages={messages}
            loading={loading}
            pending={pending}
            error={error}
            note={note}
            revealId={revealId}
            onSend={send}
            onRetry={retry}
            onClear={clear}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
