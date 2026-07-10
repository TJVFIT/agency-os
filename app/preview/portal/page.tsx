'use client';

/**
 * /preview/portal — static demo of the client-facing mobile portal, presented
 * inside a phone bezel so the agency can show "this is what your customer
 * sees". No backend: approvals, ideas and availability are local state only.
 */

import { useState } from 'react';

import { Button, Field, Input, PageHeader, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import { DEMO_AVAILABILITY, DEMO_CLIENTS, DEMO_IDEAS } from '../_demo/data';

const TABS = ['approvals', 'ideas', 'availability'] as const;
type PortalTab = (typeof TABS)[number];
type Decision = 'approved' | 'rejected';
type DemoIdea = (typeof DEMO_IDEAS)[number];

/** Pending approval cards for Ustanın Yeri — demo-local, phone tab 1. */
const APPROVAL_CARDS = [
  {
    id: 'ap1',
    title: 'Yeni yaz menüsü tanıtımı',
    emoji: '🍢',
    gradient: 'from-rose-500/30 via-orange-400/15 to-amber-300/10',
    captions: {
      tr: 'Yaz menüsü tezgâhta! Közde patlıcanın dumanı, Adana’nın harı… Ustadan söz: “Et, közün dilinden anlayana emanet.”',
      en: 'Summer menu is live! Smoky eggplant on the coals and Adana kebab straight off the fire — come taste what the usta has prepared.',
    },
    hashtags: ['#ustaninyeri', '#ankarakebap', '#yazmenusu'],
  },
  {
    id: 'ap2',
    title: 'Yemek sonrası Türk kahvesi ikramı',
    emoji: '☕',
    gradient: 'from-amber-500/25 via-stone-400/15 to-neutral-300/10',
    captions: {
      tr: 'Kebabın üstüne közde pişen Türk kahvesi ikramımız var — hafta içi her akşam. Misafir, kahvesini içmeden kalkmaz.',
      en: 'Complimentary Turkish coffee brewed over embers after your meal, every weekday evening. No guest leaves before their coffee.',
    },
    hashtags: ['#turkkahvesi', '#ustaninyeri', '#cankaya'],
  },
];

const CHIP_BASE =
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium';

const IDEA_CHIP: Record<'new' | 'refined' | 'accepted' | 'rejected', string> = {
  new: 'border-white/10 bg-white/[0.05] text-neutral-300',
  refined: 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200',
  accepted: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  rejected: 'border-red-400/20 bg-red-400/10 text-red-200',
};

/** Onaylar — per-card TR/EN captions, approve fades into a chip, reject
 *  reveals a comment box first. */
function ApprovalsDemo({
  decided,
  onDecide,
}: {
  decided: Record<string, Decision>;
  onDecide: (id: string, decision: Decision) => void;
}) {
  const [lang, setLang] = useState<Record<string, 'tr' | 'en'>>({});
  const [rejecting, setRejecting] = useState<Record<string, string>>({});
  const [fading, setFading] = useState<Record<string, boolean>>({});

  function decide(id: string, decision: Decision) {
    setFading((p) => ({ ...p, [id]: true }));
    setTimeout(() => {
      onDecide(id, decision);
      setFading((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      setRejecting((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }, 450);
  }

  const allDone = APPROVAL_CARDS.every((c) => decided[c.id]);

  return (
    <div className="space-y-3">
      {allDone && (
        <p className="animate-enter rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-200">
          {tr.approval.thanks}
        </p>
      )}
      {APPROVAL_CARDS.map((card) => {
        const decision = decided[card.id];
        if (decision) {
          return (
            <div
              key={card.id}
              className="animate-enter flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <span className="truncate text-xs text-neutral-500">
                {card.title}
              </span>
              <span
                className={`${CHIP_BASE} shrink-0 ${
                  decision === 'approved'
                    ? IDEA_CHIP.accepted
                    : IDEA_CHIP.rejected
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    decision === 'approved'
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                      : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]'
                  }`}
                />
                {decision === 'approved'
                  ? tr.statuses.approved
                  : tr.portal.ideaStatuses.rejected}
              </span>
            </div>
          );
        }

        const activeLang = lang[card.id] ?? 'tr';
        const rejectComment = rejecting[card.id];
        return (
          <article
            key={card.id}
            className={`overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              fading[card.id] ? 'scale-[0.96] opacity-0' : ''
            }`}
          >
            <div
              className={`relative aspect-[4/5] w-full bg-gradient-to-br ${card.gradient}`}
            >
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center text-6xl opacity-30"
              >
                {card.emoji}
              </span>
              <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-medium text-neutral-200 backdrop-blur">
                {tr.platforms.instagram}
              </span>
            </div>

            <div className="p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight text-neutral-100">
                  {card.title}
                </h3>
                <div className="flex shrink-0 gap-0.5 rounded-full border border-white/10 bg-white/[0.04] p-0.5">
                  {(['tr', 'en'] as const).map((code) => (
                    <button
                      key={code}
                      onClick={() =>
                        setLang((p) => ({ ...p, [card.id]: code }))
                      }
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                        activeLang === code
                          ? 'bg-white/[0.12] text-neutral-50'
                          : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                {card.captions[activeLang]}
              </p>
              <p className="mt-1.5 text-xs text-sky-300/90">
                {card.hashtags.join(' ')}
              </p>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => decide(card.id, 'approved')}
                >
                  ✓ {tr.approval.approveOne}
                </Button>
                <Button
                  variant={rejectComment !== undefined ? 'danger' : 'secondary'}
                  className="flex-1"
                  onClick={() =>
                    setRejecting((p) => ({ ...p, [card.id]: p[card.id] ?? '' }))
                  }
                >
                  ✗ {tr.approval.rejectOne}
                </Button>
              </div>

              {rejectComment !== undefined && (
                <div className="animate-enter mt-2 space-y-2">
                  <Textarea
                    rows={2}
                    autoFocus
                    placeholder={tr.approval.rejectCommentPlaceholder}
                    value={rejectComment}
                    onChange={(e) =>
                      setRejecting((p) => ({
                        ...p,
                        [card.id]: e.target.value,
                      }))
                    }
                  />
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() => decide(card.id, 'rejected')}
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

/** Fikir gönder — title+body form; submitted ideas prepend to the inbox. */
function IdeasDemo() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [ideas, setIdeas] = useState<DemoIdea[]>(DEMO_IDEAS);

  function submit() {
    if (!title.trim() || !body.trim()) return;
    setIdeas((p) => [
      {
        id: `local-${p.length + 1}`,
        title: title.trim(),
        body: body.trim(),
        status: 'new',
        refined: null,
      },
      ...p,
    ]);
    setTitle('');
    setBody('');
    setSent(true);
  }

  return (
    <div className="space-y-4">
      {sent ? (
        <p className="animate-enter rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-200">
          {tr.portal.ideaSent}
        </p>
      ) : (
        <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
          <Field label={tr.portal.ideaTitle}>
            <Input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={tr.portal.ideaBody}>
            <Textarea
              rows={4}
              value={body}
              maxLength={2000}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <Button
            variant="primary"
            className="w-full"
            disabled={!title.trim() || !body.trim()}
            onClick={submit}
          >
            {tr.portal.tabs.ideas}
          </Button>
        </div>
      )}

      <section>
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
          {tr.portal.ideasInbox}
        </h3>
        <ul className="stagger-children space-y-2">
          {ideas.map((idea) => (
            <li
              key={idea.id}
              className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-neutral-100">
                  {idea.title}
                </p>
                <span
                  className={`${CHIP_BASE} shrink-0 ${IDEA_CHIP[idea.status]}`}
                >
                  {tr.portal.ideaStatuses[idea.status]}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                {idea.body}
              </p>
              {idea.refined && (
                <div className="mt-2 rounded-lg border border-indigo-400/15 bg-indigo-400/[0.06] p-2.5">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-indigo-300/80">
                    {tr.portal.refinedSummary}
                  </p>
                  <p className="text-xs font-medium text-neutral-200">
                    {idea.refined.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">
                    {idea.refined.summary}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className={`${CHIP_BASE} ${IDEA_CHIP.new}`}>
                      {idea.refined.goal}
                    </span>
                    <span className={`${CHIP_BASE} ${IDEA_CHIP.refined}`}>
                      {
                        tr.cardTypes[
                          idea.refined
                            .suggested_type as keyof typeof tr.cardTypes
                        ]
                      }
                    </span>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Müsaitlik — datetime range + note, then the submitted windows list. */
function AvailabilityDemo() {
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const valid = startsAt !== '' && endsAt !== '' && endsAt > startsAt;

  return (
    <div className="space-y-4">
      {sent ? (
        <p className="animate-enter rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-200">
          {tr.portal.availabilitySent}
        </p>
      ) : (
        <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
          <Field label={tr.production.leaveStart}>
            <Input
              type="datetime-local"
              className="[color-scheme:dark]"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label={tr.production.leaveEnd}>
            <Input
              type="datetime-local"
              className="[color-scheme:dark]"
              min={startsAt || undefined}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
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
            onClick={() => setSent(true)}
          >
            {tr.portal.availabilityAdd}
          </Button>
        </div>
      )}

      <ul className="stagger-children space-y-2">
        {DEMO_AVAILABILITY.map((w, i) => (
          <li
            key={i}
            className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2"
          >
            <p className="text-sm text-neutral-200">{w.range}</p>
            {w.note && (
              <p className="mt-0.5 text-xs text-neutral-500">{w.note}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PreviewPortalPage() {
  const [tab, setTab] = useState<PortalTab>('approvals');
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const client = DEMO_CLIENTS[0]; // Ustanın Yeri

  const remaining = APPROVAL_CARDS.filter((c) => !decided[c.id]).length;

  return (
    <div>
      <PageHeader title={tr.portal.title} />

      <p className="animate-enter mb-5 text-center text-sm text-neutral-500">
        Müşterinize göndereceğiniz bağlantı — giriş gerektirmez
      </p>

      {/* Phone presentation frame: double bezel + notch + home indicator. */}
      <div className="animate-enter mx-auto max-w-sm">
        <div className="rounded-[2.5rem] bg-gradient-to-b from-white/[0.16] via-white/[0.07] to-white/[0.03] p-px shadow-[0_32px_90px_-24px_rgba(0,0,0,0.85)]">
          <div className="rounded-[calc(2.5rem-1px)] border border-white/[0.06] bg-neutral-950 p-1.5">
            <div className="relative overflow-hidden rounded-[2rem] bg-[#0a0a0b]">
              <div
                aria-hidden
                className="absolute left-1/2 top-2 z-10 h-5 w-28 -translate-x-1/2 rounded-full border border-white/[0.05] bg-black"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-1.5 left-1/2 z-10 h-1 w-24 -translate-x-1/2 rounded-full bg-white/15"
              />

              <div className="h-[640px] overflow-y-auto px-4 pb-8 pt-11">
                {/* Client identity header */}
                <div className="mb-4 flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{
                      background: client.colors.primary,
                      boxShadow: `0 0 18px ${client.colors.primary}66, inset 0 1px 0 rgba(255,255,255,0.3)`,
                    }}
                  >
                    {client.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-tight text-neutral-50">
                      {client.name}
                    </p>
                    <p className="truncate text-[11px] text-neutral-500">
                      {client.industry} · {client.district}
                    </p>
                  </div>
                </div>

                {/* Tabs */}
                <nav className="mb-4 flex rounded-full border border-white/10 bg-white/[0.04] p-1">
                  {TABS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`flex-1 rounded-full px-1 py-1.5 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                        tab === t
                          ? 'bg-white/[0.1] text-neutral-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                          : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {tr.portal.tabs[t]}
                      {t === 'approvals' && remaining > 0 && (
                        <span className="ml-1 rounded-full border border-sky-400/20 bg-sky-400/10 px-1.5 text-[10px] text-sky-200">
                          {remaining}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>

                {tab === 'approvals' && (
                  <ApprovalsDemo
                    decided={decided}
                    onDecide={(id, decision) =>
                      setDecided((p) => ({ ...p, [id]: decision }))
                    }
                  />
                )}
                {tab === 'ideas' && <IdeasDemo />}
                {tab === 'availability' && <AvailabilityDemo />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
