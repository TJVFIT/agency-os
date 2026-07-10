'use client';

/**
 * /preview/portal — the client-facing mobile portal rendered inside a phone
 * bezel, showing THE VISITOR'S OWN client from the demo store. Approvals move
 * real store cards, ideas create real idea cards, availability logs to the
 * live feed. Empty store → inviting empty screen linking to /preview/clients.
 */

import Link from 'next/link';
import { useState } from 'react';

import {
  Button,
  Field,
  Input,
  Select,
  PageHeader,
  Textarea,
} from '@/components/ui';
import { tr } from '@/lib/i18n/tr';

import {
  useDemoStore,
  type StoreCard,
  type StoreCardType,
  type StoreClient,
} from '../_demo/store';

const TABS = ['approvals', 'ideas', 'availability'] as const;
type PortalTab = (typeof TABS)[number];

const IDEA_TYPES: StoreCardType[] = ['post', 'reel', 'story', 'other'];

const CHIP =
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium';

/** Link styled like Button variant="primary" (Button renders a <button>). */
const PRIMARY_LINK =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(255,255,255,0.08)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.97]';

/** Onaylar — the client's own cards waiting for approval. Approve/reject
 *  move the card through the real store status machine. */
function ApprovalsTab({
  client,
  cards,
}: {
  client: StoreClient;
  cards: StoreCard[];
}) {
  const store = useDemoStore();
  const [rejecting, setRejecting] = useState<Record<string, string>>({});
  const [fading, setFading] = useState<Record<string, boolean>>({});

  function finish(
    card: StoreCard,
    decision: 'approved' | 'rejected',
    comment?: string,
  ) {
    setFading((p) => ({ ...p, [card.id]: true }));
    setTimeout(() => {
      if (decision === 'approved') {
        store.moveCard(card.id, 'approved');
        store.log(`Müşteri "${card.title}" kartını onayladı ✓`);
      } else {
        store.moveCard(card.id, 'copy_draft');
        const note = comment?.trim();
        store.log(
          note
            ? `Müşteri "${card.title}" kartını reddetti: "${note}"`
            : `Müşteri "${card.title}" kartını reddetti`,
        );
      }
      setFading((p) => {
        const next = { ...p };
        delete next[card.id];
        return next;
      });
      setRejecting((p) => {
        const next = { ...p };
        delete next[card.id];
        return next;
      });
    }, 450);
  }

  if (cards.length === 0) {
    return (
      <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-10 text-center">
        <span aria-hidden className="text-3xl">
          🎉
        </span>
        <p className="text-sm text-neutral-400">{tr.portal.noPending}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map((card) => {
        const comment = rejecting[card.id];
        return (
          <article
            key={card.id}
            className={`overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              fading[card.id] ? 'scale-[0.96] opacity-0' : ''
            }`}
          >
            {/* Media placeholder tinted with the client's own brand color. */}
            <div
              className="relative aspect-[4/5] w-full"
              style={{
                background: `linear-gradient(140deg, ${client.colors.primary}59 0%, ${client.colors.primary}1f 55%, rgba(255,255,255,0.03) 100%)`,
              }}
            >
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center text-5xl opacity-25"
              >
                ✨
              </span>
              <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                {tr.cardTypes[card.type]}
              </span>
              {card.platforms[0] && (
                <span className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  {tr.platforms[
                    card.platforms[0] as keyof typeof tr.platforms
                  ] ?? card.platforms[0]}
                </span>
              )}
            </div>

            <div className="p-3">
              <h3 className="text-sm font-semibold tracking-tight text-neutral-100">
                {card.title}
              </h3>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => finish(card, 'approved')}
                >
                  ✓ {tr.approval.approveOne}
                </Button>
                <Button
                  variant={comment !== undefined ? 'danger' : 'secondary'}
                  className="flex-1"
                  onClick={() =>
                    setRejecting((p) => ({ ...p, [card.id]: p[card.id] ?? '' }))
                  }
                >
                  ✗ {tr.approval.rejectOne}
                </Button>
              </div>

              {comment !== undefined && (
                <div className="animate-enter mt-2 space-y-2">
                  <Textarea
                    rows={2}
                    autoFocus
                    placeholder={tr.approval.rejectCommentPlaceholder}
                    value={comment}
                    onChange={(e) =>
                      setRejecting((p) => ({ ...p, [card.id]: e.target.value }))
                    }
                  />
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() => finish(card, 'rejected', comment)}
                  >
                    {tr.card.sendComment}
                  </Button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Fikir gönder — creates a real idea card on the visitor's client. */
function IdeasTab({ client }: { client: StoreClient }) {
  const store = useDemoStore();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<StoreCardType>('post');
  const [sent, setSent] = useState(false);

  const ideas = store.cards
    .filter((c) => c.clientId === client.id && c.status === 'idea')
    .slice()
    .reverse();

  function submit() {
    const clean = title.trim();
    if (!clean) return;
    store.addCard({
      clientId: client.id,
      title: clean,
      type,
      status: 'idea',
      dueAt: null,
      platforms: [],
    });
    store.log(`Müşteri yeni fikir gönderdi: "${clean}"`);
    setTitle('');
    setSent(true);
  }

  return (
    <div className="space-y-4">
      {sent && (
        <p className="animate-enter rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-200">
          {tr.portal.ideaSent}
        </p>
      )}

      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
        <Field label={tr.portal.ideaTitle}>
          <Input
            value={title}
            maxLength={200}
            onChange={(e) => {
              setTitle(e.target.value);
              setSent(false);
            }}
          />
        </Field>
        <Field label={tr.card.type}>
          <Select
            className="w-full"
            value={type}
            onChange={(e) => setType(e.target.value as StoreCardType)}
          >
            {IDEA_TYPES.map((t) => (
              <option key={t} value={t}>
                {tr.cardTypes[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="primary"
          className="w-full"
          disabled={!title.trim()}
          onClick={submit}
        >
          {tr.portal.tabs.ideas}
        </Button>
      </div>

      {ideas.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
            {tr.portal.ideasInbox}
          </h3>
          <ul className="stagger-children space-y-2">
            {ideas.map((idea) => (
              <li
                key={idea.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
              >
                <p className="min-w-0 truncate text-sm font-medium text-neutral-100">
                  {idea.title}
                </p>
                <span
                  className={`${CHIP} shrink-0 border-white/10 bg-white/[0.05] text-neutral-300`}
                >
                  {tr.portal.ideaStatuses.new}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Müsaitlik — datetime window + note; submission logs to the live feed. */
function AvailabilityTab() {
  const store = useDemoStore();
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const valid = startsAt !== '' && endsAt !== '' && endsAt > startsAt;

  function submit() {
    if (!valid) return;
    store.log('Müşteri müsaitlik bildirdi');
    setStartsAt('');
    setEndsAt('');
    setNote('');
    setSent(true);
  }

  return (
    <div className="space-y-4">
      {sent && (
        <p className="animate-enter rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-200">
          {tr.portal.availabilitySent}
        </p>
      )}

      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
        <Field label={tr.production.leaveStart}>
          <Input
            type="datetime-local"
            className="[color-scheme:dark]"
            value={startsAt}
            onChange={(e) => {
              setStartsAt(e.target.value);
              setSent(false);
            }}
          />
        </Field>
        <Field label={tr.production.leaveEnd}>
          <Input
            type="datetime-local"
            className="[color-scheme:dark]"
            min={startsAt || undefined}
            value={endsAt}
            onChange={(e) => {
              setEndsAt(e.target.value);
              setSent(false);
            }}
          />
        </Field>
        <Field label={tr.portal.availabilityNote}>
          <Input
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          className="w-full"
          disabled={!valid}
          onClick={submit}
        >
          {tr.portal.availabilityAdd}
        </Button>
      </div>
    </div>
  );
}

export default function PreviewPortalPage() {
  const store = useDemoStore();
  const [tab, setTab] = useState<PortalTab>('approvals');
  const [selectedId, setSelectedId] = useState('');

  if (!store.hydrated) {
    return (
      <div>
        <PageHeader title={tr.portal.title} />
        <div className="mx-auto h-[640px] max-w-sm animate-pulse rounded-[2.75rem] bg-white/[0.03]" />
      </div>
    );
  }

  const client =
    store.clients.find((c) => c.id === selectedId) ?? store.clients[0];

  const pending = client
    ? store.cards.filter(
        (c) =>
          c.clientId === client.id &&
          (c.status === 'translated' || c.status === 'visual_ready'),
      )
    : [];

  const subtitle = client
    ? [client.industry, client.district].filter(Boolean).join(' · ')
    : '';

  return (
    <div>
      <PageHeader title={tr.portal.title} />

      <p className="animate-enter mb-5 text-center text-sm text-neutral-500">
        Müşterinize göndereceğiniz bağlantı — giriş gerektirmez
      </p>

      {store.clients.length > 1 && client && (
        <div className="animate-enter mx-auto mb-4 max-w-sm">
          <Select
            aria-label={tr.card.client}
            className="w-full"
            value={client.id}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {store.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Phone presentation frame: double bezel + notch + home indicator. */}
      <div className="animate-enter mx-auto max-w-sm">
        <div className="relative rounded-[2.75rem] bg-gradient-to-b from-white/[0.20] via-white/[0.08] to-white/[0.03] p-px shadow-[0_48px_120px_-32px_rgba(0,0,0,0.95),0_0_80px_-40px_rgba(129,140,248,0.35)]">
          {/* Hardware buttons hinted on the shell edges. */}
          <span
            aria-hidden
            className="absolute -left-px top-28 h-10 w-px rounded-full bg-white/20"
          />
          <span
            aria-hidden
            className="absolute -left-px top-40 h-14 w-px rounded-full bg-white/20"
          />
          <span
            aria-hidden
            className="absolute -right-px top-32 h-16 w-px rounded-full bg-white/20"
          />
          <div className="rounded-[calc(2.75rem-1px)] border border-white/[0.06] bg-gradient-to-b from-neutral-900 to-neutral-950 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="relative overflow-hidden rounded-[2.25rem] bg-[#0a0a0b] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
              <div
                aria-hidden
                className="absolute left-1/2 top-2 z-10 flex h-5 w-28 -translate-x-1/2 items-center justify-end rounded-full border border-white/[0.05] bg-black pr-2.5"
              >
                {/* Camera lens dot inside the notch. */}
                <span className="h-2 w-2 rounded-full bg-[#0d0d12] shadow-[inset_0_0_2px_1px_rgba(60,70,120,0.55)]" />
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-1.5 left-1/2 z-10 h-1 w-24 -translate-x-1/2 rounded-full bg-white/15"
              />

              <div className="h-[640px] overflow-y-auto px-4 pb-8 pt-11">
                {!client ? (
                  /* No company yet — invite the visitor to create theirs. */
                  <div className="relative flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-[radial-gradient(16rem_12rem_at_50%_20%,rgba(129,140,248,0.12),transparent_70%)]"
                    />
                    <span
                      aria-hidden
                      className="relative flex h-14 w-14 items-center justify-center rounded-full border border-indigo-300/20 bg-indigo-400/10 text-2xl shadow-[0_0_32px_rgba(129,140,248,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]"
                    >
                      🏢
                    </span>
                    <p className="relative text-sm font-semibold tracking-tight text-neutral-100">
                      {tr.demo.noClients}
                    </p>
                    <p className="relative text-xs leading-relaxed text-neutral-500">
                      {tr.demo.welcomeBody}
                    </p>
                    <Link
                      href="/preview/clients"
                      className={`relative ${PRIMARY_LINK}`}
                    >
                      {tr.demo.addClientCta}
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* Client identity header — the visitor's own brand. */}
                    <div className="mb-4 flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{
                          background: client.colors.primary,
                          boxShadow: `0 0 18px ${client.colors.primary}66, inset 0 1px 0 rgba(255,255,255,0.3)`,
                        }}
                      >
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold tracking-tight text-neutral-50">
                          {client.name}
                        </p>
                        {subtitle && (
                          <p className="truncate text-[11px] text-neutral-500">
                            {subtitle}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Tabs — sliding glass indicator (transform-only). */}
                    <nav className="relative mb-4 flex rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                      <span
                        aria-hidden
                        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                        style={{
                          transform: `translateX(${TABS.indexOf(tab) * 100}%)`,
                        }}
                      />
                      {TABS.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTab(t)}
                          className={`relative z-10 flex-1 rounded-full px-1 py-1.5 text-xs font-medium transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                            tab === t
                              ? 'text-neutral-50'
                              : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          {tr.portal.tabs[t]}
                          {t === 'approvals' && pending.length > 0 && (
                            <span className="ml-1 rounded-full border border-sky-400/20 bg-sky-400/10 px-1.5 text-[10px] tabular-nums text-sky-200">
                              {pending.length}
                            </span>
                          )}
                        </button>
                      ))}
                    </nav>

                    {tab === 'approvals' && (
                      <ApprovalsTab client={client} cards={pending} />
                    )}
                    {tab === 'ideas' && <IdeasTab client={client} />}
                    {tab === 'availability' && <AvailabilityTab />}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
