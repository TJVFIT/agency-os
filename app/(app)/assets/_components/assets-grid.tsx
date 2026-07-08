'use client';

/**
 * Media grid (SPEC §12 /assets): thumbnails from asset.variants, kind/source
 * badges, per-image background removal, admin-only delete. Client + kind +
 * source filters are applied in-memory over the server-loaded page.
 * Subscribes to ai_jobs.update so freshly generated variants refresh the view.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Panel, Select } from '@/components/ui';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { deleteAsset, enqueueBgRemove } from '@/lib/actions/assets';
import { parseAssetVariants } from '@/lib/db/domain';
import { publicAssetUrl } from '@/lib/r2-url';
import { tr } from '@/lib/i18n/tr';
import type { Asset, Enums } from '@/lib/db/types';

type ClientOption = { id: string; name: string };

const KINDS: Enums<'asset_kind'>[] = ['image', 'video', 'other'];
const SOURCES: Enums<'asset_source'>[] = ['upload', 'telegram', 'ai', 'render'];

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
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            {tr.card.client}
          </span>
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
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            {tr.assets.filterKind}
          </span>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{tr.common.all}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {tr.assets.kinds[k]}
              </option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            {tr.assets.filterSource}
          </span>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{tr.common.all}</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {tr.assets.sources[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          {tr.assets.empty}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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

  const variants = parseAssetVariants(asset.variants);
  const thumbKey = variants.thumb ?? variants.square ?? variants.portrait;
  const thumbUrl = thumbKey ? publicAssetUrl(thumbKey) : null;

  function onBgRemove() {
    setError(null);
    startTransition(async () => {
      const res = await enqueueBgRemove(asset.id);
      if (!res.ok) setError(tr.errors.generic);
      else router.refresh();
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
    <div className="flex flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
      <div className="relative flex aspect-square items-center justify-center bg-neutral-900">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={asset.original_name || asset.id}
            className="h-full w-full object-cover"
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

      <div className="flex flex-1 flex-col gap-1.5 p-2">
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

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {asset.kind === 'image' && (
            <Button
              variant="secondary"
              className="px-2 py-1 text-xs"
              onClick={onBgRemove}
              disabled={pending}
            >
              {tr.assets.removeBg}
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="danger"
              className="px-2 py-1 text-xs"
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
    <span className="rounded bg-neutral-950/80 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300 ring-1 ring-neutral-700">
      {children}
    </span>
  );
}
