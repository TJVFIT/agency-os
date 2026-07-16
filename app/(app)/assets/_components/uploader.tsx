'use client';

/**
 * Upload flow (SPEC §7.1): pick a client + file → POST /api/assets/presign →
 * PUT directly to R2 → POST /api/assets/complete → router.refresh().
 * Handles 413 (too large) and 503 (R2 not configured) gracefully.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Field, Select } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { tr } from '@/lib/i18n/tr';
import type { Enums } from '@/lib/db/types';

type ClientOption = { id: string; name: string };

/** Shared focus-visible ring for interactive elements in this dialog. */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40';

function kindForType(contentType: string): Enums<'asset_kind'> {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  return 'other';
}

export function Uploader({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function reset() {
    setBusy(false);
    setError(null);
    setStatus(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleUpload() {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!clientId) {
      setError(tr.card.client + ' ' + tr.common.none.toLowerCase());
      return;
    }
    if (!file) {
      setError('Dosya seçin');
      return;
    }
    const contentType = file.type || 'application/octet-stream';
    if (!/^(image|video)\//.test(contentType)) {
      setError('Yalnızca görsel veya video yüklenebilir');
      return;
    }

    setBusy(true);
    setStatus(tr.assets.uploading);
    try {
      const presignRes = await fetch('/api/assets/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          filename: file.name,
          contentType,
          size: file.size,
        }),
      });

      if (presignRes.status === 413) {
        setError(tr.assets.tooLarge);
        setBusy(false);
        setStatus(null);
        return;
      }
      if (presignRes.status === 503) {
        setError('Depolama (R2) yapılandırılmamış');
        setBusy(false);
        setStatus(null);
        return;
      }
      if (!presignRes.ok) {
        setError(tr.errors.generic);
        setBusy(false);
        setStatus(null);
        return;
      }

      const { key, url } = (await presignRes.json()) as {
        key: string;
        url: string;
      };

      const putRes = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: file,
      });
      if (!putRes.ok) {
        setError(tr.errors.generic);
        setBusy(false);
        setStatus(null);
        return;
      }

      const completeRes = await fetch('/api/assets/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          key,
          kind: kindForType(contentType),
          originalName: file.name,
        }),
      });
      if (!completeRes.ok) {
        setError(tr.errors.generic);
        setBusy(false);
        setStatus(null);
        return;
      }

      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError(tr.errors.generic);
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <>
      <Button
        variant="primary"
        className={FOCUS_RING}
        onClick={() => setOpen(true)}
      >
        {tr.assets.upload}
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            reset();
          }
        }}
        title={tr.assets.upload}
      >
        <div className="stagger-children flex flex-col gap-3">
          <Field label={tr.card.client}>
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={`w-full ${FOCUS_RING}`}
              disabled={busy}
            >
              <option value="">{tr.common.none}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={tr.nav.assets}>
            {/* Dropzone — icon orb lifts on hover, dashed glass border. */}
            <div className="group rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-center transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/25 hover:bg-white/[0.04]">
              <span
                aria-hidden
                className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5"
              >
                🖼️
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                disabled={busy}
                className={`w-full text-xs text-neutral-400 file:mr-3 file:rounded-full file:border-0 file:bg-white/[0.08] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-200 file:transition-colors file:duration-300 hover:file:bg-white/[0.14] disabled:opacity-40 ${FOCUS_RING}`}
              />
            </div>
          </Field>

          {status && (
            <p className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-xs text-neutral-300">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(129,140,248,0.8)]"
              />
              {status}
            </p>
          )}
          {error && (
            <p className="animate-enter rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs leading-snug text-red-200">
              {error}
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <Button
              variant="ghost"
              className={FOCUS_RING}
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={busy}
            >
              {tr.common.cancel}
            </Button>
            <Button
              variant="primary"
              className={FOCUS_RING}
              onClick={handleUpload}
              disabled={busy}
            >
              {busy ? tr.assets.uploading : tr.assets.upload}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
