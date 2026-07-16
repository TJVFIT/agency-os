'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { Button, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import type { PortalAsset, PortalEditJobState } from '@/lib/portal/service';
import { fetchPortalEditJob, submitPortalEditRequest } from './actions';
import { Bezel, Orb, SectionLabel, StatusNote } from './glass';

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
      <Bezel innerClassName="space-y-3 p-3.5">
        <p className="text-xs leading-relaxed text-neutral-400">
          {tr.portal.editHint}
        </p>

        {/* Segmented kind switch — one glass track, sliding emphasis. */}
        <div
          role="radiogroup"
          className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
        >
          {(
            [
              ['edit_video', tr.portal.editKindVideo],
              ['edit_photo', tr.portal.editKindPhoto],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={kind === value}
              onClick={() => switchKind(value)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                kind === value
                  ? 'bg-white/[0.12] text-neutral-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <SectionLabel
            className="!mb-1.5"
            count={selected.length > 0 ? selected.length : undefined}
          >
            {tr.portal.editPickAssets}
          </SectionLabel>
          {pickable.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] px-3 py-5 text-center">
              <Orb className="!h-9 !w-9 !text-sm">
                {wantKind === 'video' ? '🎬' : '🖼️'}
              </Orb>
              <p className="text-xs leading-relaxed text-neutral-500">
                {tr.portal.editNoAssets}
              </p>
            </div>
          ) : (
            <div className="stagger-children -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {pickable.map((asset) => {
                const active = selected.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggle(asset.id)}
                    aria-pressed={active}
                    className={`relative w-20 shrink-0 overflow-hidden rounded-xl border text-left transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                      active
                        ? 'border-sky-400/60 bg-sky-400/10 shadow-[0_0_16px_rgba(56,189,248,0.18)]'
                        : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.05]'
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
                    {active && (
                      <span
                        aria-hidden
                        className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-sky-400 text-[10px] font-bold text-neutral-950 shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                      >
                        ✓
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
        {error && <StatusNote tone="error">{tr.common.error}</StatusNote>}
      </Bezel>

      {job?.status === 'pending' && (
        <section className="animate-enter space-y-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="flex items-center gap-2 text-sm text-sky-200">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-300 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-sky-300" />
            </span>
            {tr.portal.editQueued}
          </p>
          <div aria-hidden className="space-y-1.5">
            <div className="h-2 w-3/4 animate-pulse rounded-full bg-white/[0.07]" />
            <div className="h-2 w-1/2 animate-pulse rounded-full bg-white/[0.05]" />
          </div>
        </section>
      )}
      {job?.status === 'error' && (
        <StatusNote tone="error" className="!rounded-xl !p-4 !text-sm">
          {tr.portal.editFailed}
        </StatusNote>
      )}
      {job?.status === 'done' && (
        <section className="animate-enter space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-sm font-medium text-emerald-200">
            {tr.portal.editDone}
          </p>
          {job.note && (
            <p className="text-xs leading-relaxed text-neutral-300">
              {tr.portal.editNote}: {job.note}
            </p>
          )}
          {job.resultUrl && job.resultKind === 'video' && (
            <video
              src={job.resultUrl}
              controls
              playsInline
              className="w-full rounded-xl border border-white/[0.08]"
            />
          )}
          {job.resultUrl && job.resultKind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.resultUrl}
              alt={tr.portal.editResult}
              className="w-full rounded-xl border border-white/[0.08]"
            />
          )}
        </section>
      )}
    </div>
  );
}
