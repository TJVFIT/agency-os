'use client';

/**
 * /preview/clients — static demo of the client roster plus one expanded
 * brand profile (Ustanın Yeri) with a live-feeling idea inbox.
 * No backend: accept/reject on ideas is local state only.
 */

import { useState } from 'react';

import { Button, Label, PageHeader, Panel } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import { DEMO_CLIENTS, DEMO_IDEAS } from '../_demo/data';

type IdeaResolution = 'accepted' | 'rejected';

/** Brand profile demo content for Ustanın Yeri — demo-local data. */
const BRAND_VOICE =
  'Samimi, mahalle ustası tonunda; işine güvenen ama mütevazı. Ankara ağzına yakın, kısa ve net cümleler. Övgüyü müşteri yapar, biz işi anlatırız.';

const TONE_RULES = [
  'Kısa cümleler',
  'Sen dili',
  'Yerel referanslar',
  'Abartı yok',
  'Emoji az ve yerinde',
];

const BANNED_WORDS = ['enfes', 'lezzet şöleni', 'damak çatlatan', 'efsane'];

const HASHTAG_BANK = [
  '#ustaninyeri',
  '#ankarakebap',
  '#cankaya',
  '#izgara',
  '#ankarayemek',
  '#kebapustasi',
];

const SOCIAL_ACCOUNTS: {
  platform: keyof typeof tr.platforms;
  handle: string;
}[] = [
  { platform: 'instagram', handle: '@ustaninyeri' },
  { platform: 'facebook', handle: 'Ustanın Yeri Kebap' },
  { platform: 'tiktok', handle: '@ustaninyeri' },
];

const CHIP_BASE =
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium';

const IDEA_CHIP: Record<'new' | 'refined' | 'accepted' | 'rejected', string> = {
  new: 'border-white/10 bg-white/[0.05] text-neutral-300',
  refined: 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200',
  accepted: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  rejected: 'border-red-400/20 bg-red-400/10 text-red-200',
};

const NEUTRAL_CHIP = 'border-white/10 bg-white/[0.05] text-neutral-300';
const RED_CHIP = 'border-red-400/20 bg-red-400/10 text-red-200';
const SKY_CHIP = 'border-sky-400/20 bg-sky-400/10 text-sky-200';
const ACTIVE_CHIP = 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200';

/** Fikir kutusu — DEMO_IDEAS rows; accept/reject fades the row into a
 *  resolved chip state. */
function IdeaInbox() {
  const [fading, setFading] = useState<Record<string, boolean>>({});
  const [resolved, setResolved] = useState<Record<string, IdeaResolution>>({});

  function resolve(id: string, resolution: IdeaResolution) {
    setFading((p) => ({ ...p, [id]: true }));
    setTimeout(() => {
      setResolved((p) => ({ ...p, [id]: resolution }));
      setFading((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }, 450);
  }

  return (
    <section>
      <Label>{tr.portal.ideasInbox}</Label>
      <ul className="space-y-2">
        {DEMO_IDEAS.map((idea) => {
          const resolution = resolved[idea.id];
          return (
            <li
              key={idea.id}
              className={`rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                fading[idea.id] ? 'scale-[0.97] opacity-0' : ''
              } ${resolution ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-neutral-100">
                  {idea.title}
                </p>
                <span
                  className={`${CHIP_BASE} shrink-0 ${
                    IDEA_CHIP[resolution ?? idea.status]
                  }`}
                >
                  {tr.portal.ideaStatuses[resolution ?? idea.status]}
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
                    <span className={`${CHIP_BASE} ${NEUTRAL_CHIP}`}>
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

              {!resolution && (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    icon="✓"
                    onClick={() => resolve(idea.id, 'accepted')}
                  >
                    {tr.portal.acceptIdea}
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    icon="✗"
                    onClick={() => resolve(idea.id, 'rejected')}
                  >
                    {tr.portal.rejectIdea}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function PreviewClientsPage() {
  const detail = DEMO_CLIENTS.find((c) => c.slug === 'ustanin-yeri')!;

  return (
    <div>
      <PageHeader title={tr.clients.title} />

      {/* Client roster grid */}
      <ul className="stagger-children grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_CLIENTS.map((c) => (
          <li key={c.id}>
            <Panel className={c.id === detail.id ? 'ring-1 ring-white/10' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background: c.colors.primary,
                      boxShadow: `0 0 10px ${c.colors.primary}99`,
                    }}
                  />
                  <h2 className="truncate text-sm font-semibold tracking-tight text-neutral-100">
                    {c.name}
                  </h2>
                </div>
                <span className={`${CHIP_BASE} shrink-0 ${ACTIVE_CHIP}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                  {tr.clients.active}
                </span>
              </div>

              <p className="mt-2 text-xs text-neutral-500">
                {c.industry} · {c.district}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.langs.map((l) => (
                  <span
                    key={l}
                    className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-300"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </Panel>
          </li>
        ))}
      </ul>

      {/* Expanded brand profile for Ustanın Yeri */}
      <Panel
        title={`${detail.name} — ${tr.clients.brandProfile}`}
        className="animate-enter mt-4"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-5">
            <section>
              <Label>{tr.clients.voice}</Label>
              <p className="text-sm leading-relaxed text-neutral-300">
                {BRAND_VOICE}
              </p>
            </section>

            <section>
              <Label>{tr.clients.toneRules}</Label>
              <div className="flex flex-wrap gap-1.5">
                {TONE_RULES.map((rule) => (
                  <span key={rule} className={`${CHIP_BASE} ${NEUTRAL_CHIP}`}>
                    {rule}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <Label>{tr.clients.bannedWords}</Label>
              <div className="flex flex-wrap gap-1.5">
                {BANNED_WORDS.map((word) => (
                  <span key={word} className={`${CHIP_BASE} ${RED_CHIP}`}>
                    {word}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <Label>{tr.clients.hashtagBank}</Label>
              <div className="flex flex-wrap gap-1.5">
                {HASHTAG_BANK.map((tag) => (
                  <span key={tag} className={`${CHIP_BASE} ${SKY_CHIP}`}>
                    {tag}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <Label>{tr.clients.socialAccounts}</Label>
              <ul className="space-y-1.5">
                {SOCIAL_ACCOUNTS.map((a) => (
                  <li
                    key={a.platform}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                  >
                    <span className="text-xs text-neutral-400">
                      {tr.platforms[a.platform]}
                    </span>
                    <span className="font-mono text-xs text-neutral-200">
                      {a.handle}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <IdeaInbox />
        </div>
      </Panel>
    </div>
  );
}
