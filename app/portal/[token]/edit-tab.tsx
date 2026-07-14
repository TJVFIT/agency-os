'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { Button, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import type { PortalAsset, PortalEditJobState } from '@/lib/portal/service';
import { fetchPortalEditJob, submitPortalEditRequest } from './actions';

const POLL_MS = 5_000;
const MAX_VIDEO_SOURCES = 4;

type EditKind = 'edit_video' | 'edit_photo';

/** AI Editör tab — pick own media + a prompt, poll the queued edit job. */
export function EditTab({
  token,
  media,
}: {
  token: string;
  media: PortalAsset[];
}) {
  const [kind, setKind] = useState<EditKind>('edit_video');
  const [selected, setSelected] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<PortalEditJobState | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wantKind = kind === 'edit_video' ? 'video' : 'image';
  // Only the client's own uploads are edit sources (results are 'render').
  const pickable = media.filter(
    (a) => a.source === 'client' && a.kind === wantKind,
  );

  useEffect(() => {
    if (!jobId) return;
    const poll = async () => {
      const res = await fetchPortalEditJob({ token, jobId });
      if (res.ok && res.data) {
        setJob(res.data);
        if (res.data.status !== 'pending' && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };
    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [token, jobId]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (kind === 'edit_photo') return [id];
      return prev.length >= MAX_VIDEO_SOURCES ? prev : [...prev, id];
    });
  }

  function switchKind(next: EditKind) {
    setKind(next);
    setSelected([]);
    setJobId(null);
    setJob(null);
  }

  function submit() {
    if (!prompt.trim() || selected.length === 0) return;
    setError(false);
    setJob(null);
    startTransition(async () => {
      const res = await submitPortalEditRequest({
        token,
        kind,
        assetIds: selected,
        prompt: prompt.trim(),
      });
      if (res.ok && res.data) {
        setJobId(res.data.jobId);
        setJob({ status: 'pending', note: '', resultUrl: null, resultKind: null });
      } else {
        setError(true);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
        <p className="text-xs text-neutral-400">{tr.portal.editHint}</p>

        <div className="flex gap-1.5">
          {(
            [
              ['edit_video', tr.portal.editKindVideo],
              ['edit_photo', tr.portal.editKindPhoto],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => switchKind(value)}
              className={`flex-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                kind === value
                  ? 'border-white/20 bg-white/[0.12] text-neutral-50'
                  : 'border-white/10 bg-white/[0.04] text-neutral-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
            {tr.portal.editPickAssets}
          </p>
          {pickable.length === 0 ? (
            <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-center text-xs text-neutral-500">
              {tr.portal.editNoAssets}
            </p>
          ) : (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {pickable.map((asset) => {
                const active = selected.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggle(asset.id)}
                    className={`w-20 shrink-0 overflow-hidden rounded-xl border text-left transition-colors ${
                      active
                        ? 'border-sky-400/60 bg-sky-400/10'
                        : 'border-white/[0.08] bg-white/[0.03]'
                    }`}
                  >
                    {asset.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.thumbUrl}
                        alt=""
                        className="h-14 w-full object-cover"
                      />
                    ) : (
                      <span className="grid h-14 w-full place-items-center text-lg">
                        {asset.kind === 'video' ? '🎬' : '🖼️'}
                      </span>
                    )}
                    <p className="truncate px-1.5 py-1 text-[10px] text-neutral-400">
                      {asset.name || tr.assets.kinds[asset.kind]}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={tr.portal.editPrompt}
          maxLength={1000}
          rows={3}
        />
        <Button
          variant="primary"
          className="w-full !py-3.5"
          disabled={pending || !prompt.trim() || selected.length === 0}
          onClick={submit}
        >
          {pending ? tr.common.loading : tr.portal.editSubmit}
        </Button>
        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-center text-xs text-red-300">
            {tr.common.error}
          </p>
        )}
      </div>

      {job?.status === 'pending' && (
        <p className="animate-enter flex items-center justify-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/10 p-4 text-center text-sm text-sky-200">
          <span className="size-2 animate-pulse rounded-full bg-sky-300" />
          {tr.portal.editQueued}
        </p>
      )}
      {job?.status === 'error' && (
        <p className="animate-enter rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-center text-sm text-red-300">
          {tr.portal.editFailed}
        </p>
      )}
      {job?.status === 'done' && (
        <section className="animate-enter space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3.5">
          <p className="text-sm font-medium text-emerald-200">
            {tr.portal.editDone}
          </p>
          {job.note && (
            <p className="text-xs text-neutral-300">
              {tr.portal.editNote}: {job.note}
            </p>
          )}
          {job.resultUrl && job.resultKind === 'video' && (
            <video
              src={job.resultUrl}
              controls
              playsInline
              className="w-full rounded-xl"
            />
          )}
          {job.resultUrl && job.resultKind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.resultUrl}
              alt={tr.portal.editResult}
              className="w-full rounded-xl"
            />
          )}
        </section>
      )}
    </div>
  );
}
