'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { Select } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';

/**
 * Client-name filter for the reports list. Pushes the chosen client id into
 * the `client` search param so the (server) page can re-query.
 */
export function ClientFilter({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('client') ?? '';

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set('client', value);
    else next.delete('client');
    const qs = next.toString();
    router.push(qs ? `/reports?${qs}` : '/reports');
  }

  return (
    <Select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      aria-label={tr.card.client}
    >
      <option value="">{tr.common.all}</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}
