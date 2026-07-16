'use client';

/**
 * Media grid (SPEC §12 /assets): thumbnails from asset.variants, kind/source
 * badges, per-image background removal, admin-only delete. Client + kind +
 * source filters are applied in-memory over the server-loaded page.
 * Subscribes to ai_jobs.update so freshly generated variants refresh the view.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Field, Panel, Select, Textarea } from '@/components/ui';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { enqueueAiJob } from '@/lib/actions/ai';
import { deleteAsset, enqueueBgRemove } from '@/lib/actions/assets';
import { parseAssetVariants } from '@/lib/db/domain';
import { publicAssetUrl } from '@/lib/r2-url';
import { tr } from '@/lib/i18n/tr';
import type { Asset, Enums } from '@/lib/db/types';

type ClientOption = { id: string; name: string };

const KINDS: Enums<'asset_kind'>[] = ['image', 'video', 'other'];
const SOURCES: Enums<'asset_source'>[] = [
  'upload',
  'telegram',
  'ai',
  'render',
  'client',
];

/** Shared focus-visible ring for interactive elements in this view. */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40';

const KIND_GLYPHS: Record<Enums<'asset_kind'>, string> = {
  image: '🖼️',
  video: '🎬',
  other: '📎',
};

export function AssetsGrid({
  assets,
  clients,
  isAdmin,
}: {
  assets: Asset[];
  clients: ClientOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [kind, setKind] = useState('');
  const [source, setSource] = useState('');

  const clientNames = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  // When a media job finishes (e.g. image_variants), refresh to show thumbs.
  useRealtimeEvent('ai_jobs.update', (job) => {
    if (job.status === 'done' || job.status === 'error') {
      router.refresh();
    }
  });

  const filtered = useMemo(
    () =>
      assets.filter(
        (a) =>
          (!clientId || a.client_id === clientId) &&
          (!kind || a.kind === kind) &&
          (!source || a.source === source),
      ),
    [assets, clientId, kind, source],
  );

  return (
    <Panel className="animate-enter">
      {/* Filter toolbar — hairline divider separates it from the grid. */}
      <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-white/[0.06] pb-4">
        <div className="min-w-[8.5rem] max-w-full flex-1 sm:flex-none">
          <Field label={tr.card.client}>
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={`w-full ${FOCUS_RING}`}
            >
              <option value="">{tr.common.all}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="min-w-[7rem] flex-1 sm:flex-none">
          <Field label={tr.assets.filterKind}>
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={`w-full ${FOCUS_RING}`}
            >
              <option value="">{tr.common.all}</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {tr.assets.kinds[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="min-w-[7rem] flex-1 sm:flex-none">
          <Field label={tr.assets.filterSource}>
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={`w-full ${FOCUS_RING}`}
            >
              <option value="">{tr.common.all}</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {tr.assets.sources[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Result count — tabular-nums glass chip pinned to the end. */}
        <span className="ml-auto inline-flex items-center gap-1.5 self-end rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <span className="font-semibold tabular-nums text-neutral-100">
            {filtered.length}
          </span>
          {tr.nav.assets}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="animate-enter flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
          <span aria-hidden className="relative">
            <span className="absolute -inset-3 rounded-full bg-indigo-400/10 blur-xl" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.02] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_-8px_rgba(0,0,0,0.6)]">
              🖼️
            </span>
          </span>
          <p className="text-sm text-neutral-500">{tr.assets.empty}</p>
        </div>
      ) : (
        <div className="stagger-children grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              clientName={clientNames[asset.client_id]}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function AssetCard({
  asset,
  clientName,
  isAdmin,
}: {
  asset: Asset;
  clientName?: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editQueued, setEditQueued] = useState(false);

  const variants = parseAssetVariants(asset.variants);
  const thumbKey = variants.thumb ?? variants.square ?? variants.portrait;
  const thumbUrl = thumbKey ? publicAssetUrl(thumbKey) : null;
  const editable = asset.kind === 'image' || asset.kind === 'video';

  function onBgRemove() {
    setError(null);
    startTransition(async () => {
      const res = await enqueueBgRemove(asset.id);
      if (!res.ok) setError(tr.errors.generic);
      else router.refresh();
    });
  }

  function onAiEdit() {
    if (!editPrompt.trim()) return;
    setError(null);
    startTransition(async () => {
      const res =
        asset.kind === 'video'
          ? await enqueueAiJob('edit_video', {
              client_id: asset.client_id,
              asset_ids: [asset.id],
              prompt: editPrompt.trim(),
            })
          : await enqueueAiJob('edit_photo', {
              client_id: asset.client_id,
              asset_id: asset.id,
              prompt: editPrompt.trim(),
            });
      if (!res.ok) {
        setError(tr.errors.generic);
      } else {
        setEditQueued(true);
        setEditOpen(false);
        setEditPrompt('');
      }
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteAsset(asset.id);
      if (!res.ok)
        setError(
          res.error === 'forbidden' ? tr.common.forbidden : tr.errors.generic,
        );
      else router.refresh();
    });
  }

  return (
    // Double-bezel shell: gradient hairline wrapper around a solid core.
    <div className="group flex flex-col rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_8px_28px_-14px_rgba(0,0,0,0.7)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:from-white/[0.16] hover:via-white/[0.06] hover:shadow-[0_16px_40px_-14px_rgba(0,0,0,0.85)]">
      <div className="flex flex-1 flex-col overflow-hidden rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-white/[0.02]">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt={asset.original_name || asset.id}
              className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 px-2 text-center">
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                {KIND_GLYPHS[asset.kind]}
              </span>
              <span
                className={`text-[11px] text-neutral-500 ${
                  asset.kind === 'image' ? 'animate-pulse' : ''
                }`}
              >
                {asset.kind === 'image'
                  ? tr.assets.processingVariants
                  : tr.assets.kinds[asset.kind]}
              </span>
            </div>
          )}
          {/* Top scrim keeps badges legible over bright media. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/45 to-transparent"
          />
          <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
            <Chip>{tr.assets.kinds[asset.kind]}</Chip>
            <Chip
              tone={
                asset.source === 'ai'
                  ? 'ai'
                  : asset.source === 'client'
                    ? 'client'
                    : 'neutral'
              }
            >
              {tr.assets.sources[asset.source]}
            </Chip>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-2.5">
          <p
            className="truncate text-xs text-neutral-300"
            title={asset.original_name || undefined}
          >
            {asset.original_name || asset.id.slice(0, 8)}
          </p>
          {clientName && (
            <p className="truncate text-[11px] text-neutral-500">
              {clientName}
            </p>
          )}

          {error && (
            <p className="animate-enter rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11px] leading-snug text-red-200">
              {error}
            </p>
          )}
          {editQueued && (
            <p className="animate-enter rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[11px] leading-snug text-emerald-200">
              {tr.assets.aiEditQueued}
            </p>
          )}

          {editOpen && (
            <div className="animate-enter space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <Textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder={tr.assets.aiEditPrompt}
                maxLength={1000}
                rows={2}
              />
              <div className="flex gap-1.5">
                <Button
                  variant="primary"
                  className={`px-2.5 py-1 text-xs ${FOCUS_RING}`}
                  onClick={onAiEdit}
                  disabled={pending || !editPrompt.trim()}
                >
                  {pending ? tr.common.loading : tr.assets.aiEdit}
                </Button>
                <Button
                  variant="secondary"
                  className={`px-2.5 py-1 text-xs ${FOCUS_RING}`}
                  onClick={() => setEditOpen(false)}
                  disabled={pending}
                >
                  {tr.common.cancel}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {editable && !editOpen && (
              <Button
                variant="secondary"
                className={`px-2.5 py-1 text-xs ${FOCUS_RING}`}
                onClick={() => {
                  setEditQueued(false);
                  setEditOpen(true);
                }}
                disabled={pending}
              >
                {tr.assets.aiEdit}
              </Button>
            )}
            {asset.kind === 'image' && (
              <Button
                variant="secondary"
                className={`px-2.5 py-1 text-xs ${FOCUS_RING}`}
                onClick={onBgRemove}
                disabled={pending}
              >
                {tr.assets.removeBg}
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="danger"
                className={`px-2.5 py-1 text-xs ${FOCUS_RING}`}
                onClick={onDelete}
                disabled={pending}
              >
                {tr.common.delete}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Unified rounded-full border+tint chip used for the media badges. */
function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ai' | 'client';
}) {
  const TONES: Record<'neutral' | 'ai' | 'client', string> = {
    neutral: 'border-white/10 bg-black/55 text-neutral-200',
    ai: 'border-indigo-400/30 bg-indigo-500/20 text-indigo-100',
    client: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100',
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur-md ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
