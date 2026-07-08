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
      <Button variant="primary" onClick={() => setOpen(true)}>
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
        <div className="flex flex-col gap-3">
          <Field label={tr.card.client}>
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full"
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              disabled={busy}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-neutral-200"
            />
          </Field>

          {status && <p className="text-xs text-neutral-400">{status}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={busy}
            >
              {tr.common.cancel}
            </Button>
            <Button variant="primary" onClick={handleUpload} disabled={busy}>
              {busy ? tr.assets.uploading : tr.assets.upload}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
