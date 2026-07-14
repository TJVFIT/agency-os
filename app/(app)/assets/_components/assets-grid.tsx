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
    <Panel>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={tr.card.client}>
          <Select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">{tr.common.all}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={tr.assets.filterKind}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{tr.common.all}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {tr.assets.kinds[k]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={tr.assets.filterSource}>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{tr.common.all}</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {tr.assets.sources[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {filtered.length === 0 ? (
        <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            🖼️
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
    <div className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.06] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)]">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-white/[0.02]">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={asset.original_name || asset.id}
            className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.04]"
          />
        ) : (
          <span className="px-2 text-center text-[11px] text-neutral-500">
            {asset.kind === 'image'
              ? tr.assets.processingVariants
              : tr.assets.kinds[asset.kind]}
          </span>
        )}
        <div className="absolute left-1.5 top-1.5 flex gap-1">
          <Badge>{tr.assets.kinds[asset.kind]}</Badge>
          <Badge>{tr.assets.sources[asset.source]}</Badge>
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
          <p className="truncate text-[11px] text-neutral-500">{clientName}</p>
        )}

        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {editQueued && (
          <p className="animate-enter text-[11px] text-emerald-300">
            {tr.assets.aiEditQueued}
          </p>
        )}

        {editOpen && (
          <div className="space-y-1.5">
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
                className="px-2.5 py-1 text-xs"
                onClick={onAiEdit}
                disabled={pending || !editPrompt.trim()}
              >
                {pending ? tr.common.loading : tr.assets.aiEdit}
              </Button>
              <Button
                variant="secondary"
                className="px-2.5 py-1 text-xs"
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
              className="px-2.5 py-1 text-xs"
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
              className="px-2.5 py-1 text-xs"
              onClick={onBgRemove}
              disabled={pending}
            >
              {tr.assets.removeBg}
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="danger"
              className="px-2.5 py-1 text-xs"
              onClick={onDelete}
              disabled={pending}
            >
              {tr.common.delete}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-200 backdrop-blur-sm">
      {children}
    </span>
  );
}
