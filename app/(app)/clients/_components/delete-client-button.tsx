'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { deleteClientAction } from '@/lib/actions/clients';
import { tr } from '@/lib/i18n/tr';

export function DeleteClientButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteClientAction(clientId);
      if (!res.ok) {
        setError(tr.common.error);
        return;
      }
      setOpen(false);
      router.push('/clients');
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {tr.common.delete}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tr.common.delete}
      >
        <p className="text-sm text-neutral-300">{tr.clients.deleteConfirm}</p>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {tr.common.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={confirmDelete}
            disabled={pending}
          >
            {pending ? tr.common.loading : tr.common.delete}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
