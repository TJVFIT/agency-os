'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import { fmtIstanbulDate } from '@/lib/dates';
import type { PortalAsset } from '@/lib/portal/service';
import { completePortalUpload, presignPortalUpload } from './actions';
import { Bezel, Orb, ROW, SectionLabel, StatusNote } from './glass';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; current: number; total: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

/** Yükle tab — direct-to-R2 client uploads (presign → PUT → complete). */
export function UploadTab({
  token,
  initial,
}: {
  token: string;
  initial: PortalAsset[];
}) {
  const [uploads, setUploads] = useState<PortalAsset[]>(
    initial.filter((a) => a.source === 'client'),
  );
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File): Promise<string | null> {
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const presigned = await presignPortalUpload({
      token,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    });
    if (!presigned.ok || !presigned.data) {
      return presigned.ok ? tr.portal.uploadFailed : mapError(presigned.error);
    }
    const put = await fetch(presigned.data.url, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    }).catch(() => null);
    if (!put?.ok) return tr.portal.uploadFailed;

    const completed = await completePortalUpload({
      token,
      key: presigned.data.key,
      kind,
      originalName: file.name,
    });
    if (!completed.ok || !completed.data) {
      return completed.ok ? tr.portal.uploadFailed : mapError(completed.error);
    }
    setUploads((prev) => [
      {
        id: completed.data!.assetId,
        kind,
        name: file.name,
        source: 'client',
        createdAt: new Date().toISOString(),
        thumbUrl: null,
        url: null,
      },
      ...prev,
    ]);
    return null;
  }

  function mapError(error: string | undefined): string {
    if (error === 'too_large') return tr.portal.uploadTooLarge;
    if (error === 'r2_not_configured') return tr.portal.uploadUnavailable;
    return tr.portal.uploadFailed;
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    for (const [i, file] of list.entries()) {
      setState({ phase: 'uploading', current: i + 1, total: list.length });
      const error = await uploadOne(file);
      if (error) {
        setState({ phase: 'error', message: error });
        return;
      }
    }
    setState({ phase: 'done' });
  }

  return (
    <div className="space-y-4">
      <Bezel innerClassName="space-y-3 p-3.5">
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-6 text-center">
          <Orb>📤</Orb>
          <p className="max-w-[32ch] text-xs leading-relaxed text-neutral-400">
            {tr.portal.uploadHint}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
        <Button
          variant="primary"
          className="w-full !py-3.5"
          disabled={state.phase === 'uploading'}
          onClick={() => inputRef.current?.click()}
        >
          {state.phase === 'uploading'
            ? `${tr.assets.uploading} (${state.current}/${state.total})`
            : tr.portal.uploadPick}
        </Button>
        {state.phase === 'uploading' && (
          <div className="animate-enter space-y-1.5" aria-hidden>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-sky-400/70 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                style={{
                  width: `${Math.round((state.current / state.total) * 100)}%`,
                }}
              />
            </div>
            <p className="text-center text-[11px] tabular-nums text-neutral-500">
              {state.current} / {state.total}
            </p>
          </div>
        )}
        {state.phase === 'done' && (
          <StatusNote tone="success">{tr.portal.uploadDone}</StatusNote>
        )}
        {state.phase === 'error' && (
          <StatusNote tone="error">{state.message}</StatusNote>
        )}
      </Bezel>

      {uploads.length > 0 && (
        <section>
          <SectionLabel count={uploads.length}>
            {tr.portal.myUploads}
          </SectionLabel>
          <ul className="stagger-children space-y-2">
            {uploads.map((asset) => (
              <li
                key={asset.id}
                className={`flex items-center gap-3 px-3 py-2.5 ${ROW}`}
              >
                {asset.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.thumbUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-lg border border-white/[0.08] object-cover"
                  />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                    {asset.kind === 'video' ? '🎬' : '🖼️'}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {asset.name || tr.assets.kinds[asset.kind]}
                  </p>
                  <p className="text-[11px] tabular-nums text-neutral-500">
                    {fmtIstanbulDate(asset.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
