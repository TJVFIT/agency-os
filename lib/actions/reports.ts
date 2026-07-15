'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { Json } from '@/lib/db/types';
import type { ActionResult } from '@/lib/actions/cards';

const metricsSchema = z.object({
  clientId: z.uuid(),
  weekStart: z.iso.date(),
  metrics: z.record(z.string(), z.unknown()),
});

/** Manual metrics entry on the client page (SPEC §8: v1 metrics are manual). */
export async function saveReportMetrics(
  input: z.input<typeof metricsSchema>,
): Promise<ActionResult> {
  await requireRole('admin', 'manager');
  const parsed = metricsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();

  // Merge, don't replace: the Friday cron auto-fills nested metrics
  // (publishes/quota/payments) that this manual editor must not clobber. Keep
  // the cron-owned nested keys, replace only the manual scalar entries (so a
  // deleted manual row also disappears).
  const { data: existingRow } = await supabase
    .from('reports')
    .select('metrics')
    .eq('client_id', parsed.data.clientId)
    .eq('week_start', parsed.data.weekStart)
    .maybeSingle();
  const existing =
    existingRow?.metrics &&
    typeof existingRow.metrics === 'object' &&
    !Array.isArray(existingRow.metrics)
      ? (existingRow.metrics as Record<string, unknown>)
      : {};
  const preserved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(existing)) {
    if (v !== null && typeof v === 'object') preserved[k] = v;
  }
  const merged = { ...preserved, ...parsed.data.metrics };

  const { error } = await supabase.from('reports').upsert(
    {
      client_id: parsed.data.clientId,
      week_start: parsed.data.weekStart,
      metrics: merged as Json,
    },
    { onConflict: 'client_id,week_start' },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath('/reports');
  return { ok: true };
}
