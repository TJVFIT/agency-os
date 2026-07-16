'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { Button, Panel, Textarea } from '@/components/ui';
import { useRealtimeEvent } from '@/components/realtime-provider';
import {
  markClientMessagesRead,
  sendClientMessage,
} from '@/lib/actions/messages';
import { fmtIstanbul } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { ClientMessage } from '@/lib/db/types';

import { CountChip, EmptyState, ErrorNote } from '../../_components/empty-state';

/**
 * Team side of the client thread — realtime via the shared app-live channel
 * (client_messages is in the realtime publication, 0009). Opening the panel
 * marks client messages read.
 */
export function MessagesPanel({
  clientId,
  initial,
  authorNames,
}: {
  clientId: string;
  initial: ClientMessage[];
  authorNames: Record<string, string>;
}) {
  const [messages, setMessages] = useState<ClientMessage[]>(initial);
  const [body, setBody] = useState('');
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useRealtimeEvent('client_messages.insert', (message) => {
    if (message.client_id !== clientId) return;
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, message],
    );
    if (message.sender === 'client') void markClientMessagesRead(clientId);
  });

  useEffect(() => {
    const timer = setTimeout(() => void markClientMessagesRead(clientId), 300);
    return () => clearTimeout(timer);
  }, [clientId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  function send() {
    if (!body.trim()) return;
    setError(false);
    startTransition(async () => {
      const res = await sendClientMessage({ clientId, body: body.trim() });
      if (res.ok) setBody('');
      else setError(true);
      // The realtime INSERT event appends the row; no optimistic insert
      // needed (and none possible without the generated id).
    });
  }

  return (
    <Panel
      title={tr.clients.messagesTitle}
      actions={<CountChip value={messages.length} />}
    >
      <div
        ref={scrollRef}
        className="stagger-children mb-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
      >
        {messages.length === 0 && (
          <EmptyState bare compact icon="💬" text={tr.clients.messagesEmpty} />
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.sender === 'team' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl border px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
                m.sender === 'team'
                  ? 'rounded-br-md border-indigo-400/20 bg-indigo-400/10'
                  : 'rounded-bl-md border-emerald-400/20 bg-emerald-400/[0.08]'
              }`}
            >
              <p className="whitespace-pre-wrap break-words text-sm text-neutral-100">
                {m.body}
              </p>
              <p className="mt-1 text-[10px] tabular-nums text-neutral-500">
                {m.sender === 'team'
                  ? (m.author && authorNames[m.author]) || tr.clients.teamLabel
                  : tr.clients.clientLabel}{' '}
                · {fmtIstanbul(m.created_at, 'd MMM HH:mm')}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={tr.clients.messagePlaceholder}
          maxLength={2000}
          rows={2}
        />
        <div className="flex items-center justify-end gap-2">
          {error && <ErrorNote text={tr.common.error} className="flex-1" />}
          <Button
            variant="primary"
            disabled={pending || !body.trim()}
            onClick={send}
          >
            {pending ? tr.common.loading : tr.portal.messageSend}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
