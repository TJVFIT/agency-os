'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import type { ClientContact } from '@/lib/db/domain';
import { submitPortalContact } from './actions';
import { Bezel, StatusNote } from './glass';

const FIELDS = [
  'phone',
  'email',
  'address',
  'district',
  'website',
  'instagram',
  'hours',
] as const;

/** Bilgiler tab — the client maintains their own company contact card. */
export function InfoTab({
  token,
  initial,
}: {
  token: string;
  initial: ClientContact;
}) {
  const [contact, setContact] = useState<ClientContact>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function set(field: keyof ClientContact, value: string) {
    setContact((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function save() {
    setError(false);
    startTransition(async () => {
      const res = await submitPortalContact({ token, contact });
      if (res.ok) setSaved(true);
      else setError(true);
    });
  }

  return (
    <Bezel innerClassName="space-y-3 p-3.5">
      <p className="text-xs leading-relaxed text-neutral-400">
        {tr.portal.infoHint}
      </p>
      {FIELDS.map((field) => (
        <Field key={field} label={tr.portal.contactFields[field]}>
          <Input
            value={contact[field]}
            onChange={(e) => set(field, e.target.value)}
          />
        </Field>
      ))}
      <Field label={tr.portal.contactFields.notes}>
        <Textarea
          value={contact.notes}
          onChange={(e) => set('notes', e.target.value)}
          maxLength={1000}
          rows={3}
        />
      </Field>
      <Button
        variant="primary"
        className="w-full !py-3.5"
        disabled={pending}
        onClick={save}
      >
        {pending ? tr.common.loading : tr.common.save}
      </Button>
      {saved && <StatusNote tone="success">{tr.portal.infoSaved}</StatusNote>}
      {error && <StatusNote tone="error">{tr.common.error}</StatusNote>}
    </Bezel>
  );
}
