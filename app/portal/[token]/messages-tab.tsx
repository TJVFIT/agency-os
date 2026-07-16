'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { Button, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import { fmtIstanbul } from '@/lib/dates';
import type { PortalMessage } from '@/lib/portal/service';
import { fetchPortalMessages, submitPortalMessage } from './actions';
import { Orb, StatusNote } from './glass';

const POLL_MS = 15_000;

/** Mesajlar tab — the client's thread with the agency team. */
export function MessagesTab({
  token,
  initial,
}: {
  token: string;
  initial: PortalMessage[];
}) {
  const [messages, setMessages] = useState<PortalMessage[]>(initial);
  const [body, setBody] = useState('');
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const res = await fetchPortalMessages(token);
    if (res.ok && res.data) setMessages(res.data.messages);
  }

  // Opening the tab marks team messages read (the first fetch does it);
  // afterwards the interval keeps the thread fresh.
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 300);
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  function send() {
    if (!body.trim()) return;
    setError(false);
    startTransition(async () => {
      const res = await submitPortalMessage({ token, body: body.trim() });
      if (res.ok) {
        setBody('');
        await refresh();
      } else {
        setError(true);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div
        ref={scrollRef}
        className="max-h-[50vh] space-y-2 overflow-y-auto rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Orb>💬</Orb>
            <p className="max-w-[26ch] text-sm leading-relaxed text-neutral-500">
              {tr.portal.messagesEmpty}
            </p>
          </div>
        )}
        <div className="stagger-children space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender === 'client' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl border px-3 py-2 ${
                  m.sender === 'client'
                    ? 'rounded-br-md border-sky-400/20 bg-sky-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                    : 'rounded-bl-md border-white/[0.08] bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                }`}
              >
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-100">
                  {m.body}
                </p>
                <p
                  className={`mt-1 text-[10px] tabular-nums ${
                    m.sender === 'client'
                      ? 'text-sky-200/50'
                      : 'text-neutral-500'
                  }`}
                >
                  {m.sender === 'client'
                    ? tr.portal.messageYou
                    : tr.portal.messageTeam}{' '}
                  · {fmtIstanbul(m.createdAt, 'd MMM HH:mm')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]">
        <div className="space-y-2 rounded-[calc(1rem-1px)] bg-[#0a0a0b] p-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tr.portal.messagePlaceholder}
            maxLength={2000}
            rows={2}
          />
          <Button
            variant="primary"
            className="w-full !py-3"
            disabled={pending || !body.trim()}
            onClick={send}
          >
            {pending ? tr.common.loading : tr.portal.messageSend}
          </Button>
          {error && <StatusNote tone="error">{tr.common.error}</StatusNote>}
        </div>
      </div>
    </div>
  );
}
