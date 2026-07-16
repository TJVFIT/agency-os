'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole, requireSession } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { ActionResult } from '@/lib/actions/cards';

/** Generate a 10-minute Telegram /link code (SPEC §9). */
export async function generateTelegramCode(): Promise<
  ActionResult<{ code: string }>
> {
  const session = await requireSession();
  const code = randomBytes(4).toString('hex'); // 8 hex chars
  const admin = createSupabaseAdmin();
  const { error } = await admin.from('telegram_link_codes').insert({
    code,
    profile_id: session.userId,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { code } };
}

export async function updateProfile(fullName: string): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = z.string().min(1).max(120).safeParse(fullName);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data })
    .eq('id', session.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

const inviteSchema = z.object({
  email: z.email(),
  fullName: z.string().min(1).max(120),
  role: z.enum(['admin', 'manager', 'member']),
  password: z.string().min(8).max(72),
});

/** Admin creates a team user (SPEC §4: no public signup). */
export async function inviteUser(
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult> {
  await requireRole('admin');
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const admin = createSupabaseAdmin();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (error) return { ok: false, error: error.message };

  const { error: roleErr } = await admin
    .from('profiles')
    .update({ role: parsed.data.role, full_name: parsed.data.fullName })
    .eq('id', created.user.id);
  if (roleErr) return { ok: false, error: roleErr.message };

  revalidatePath('/settings');
  return { ok: true };
}

const roleSchema = z.object({
  profileId: z.uuid(),
  role: z.enum(['admin', 'manager', 'member']),
});

export async function setUserRole(
  input: z.input<typeof roleSchema>,
): Promise<ActionResult> {
  await requireRole('admin');
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

/** SPEC v4: çekim bloğu bounds — a shoot block is 30 min .. 12 h. */
const shootBlockSchema = z.number().int().min(30).max(720);

/**
 * Admin edits the global çekim bloğu (app_settings.shoot_block_minutes,
 * migration 0010). The row is seeded by the migration and updates fire the
 * app_settings_log trigger (hard rule 2), so no explicit log here.
 */
export async function updateShootBlockMinutes(
  minutes: number,
): Promise<ActionResult> {
  const session = await requireRole('admin'); // RLS: admin_write_app_settings
  const parsed = shootBlockSchema.safeParse(minutes);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from('app_settings')
    .update({
      value: parsed.data,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('key', 'shoot_block_minutes')
    .select('key') // surfaces a missing seed row as an error
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Effective çekim bloğu for a client (v4): per-client override
 * (clients.shoot_block_minutes) ?? app_settings global ?? 210 minutes.
 * Shoot-creating flows (production / fleet planner) call this before
 * computing the reserved window.
 */
export async function resolveShootBlockMinutes(
  clientId?: string | null,
): Promise<number> {
  await requireSession();
  const supabase = await createSupabaseServer();

  if (clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('shoot_block_minutes')
      .eq('id', clientId)
      .maybeSingle();
    if (client?.shoot_block_minutes != null) return client.shoot_block_minutes;
  }

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'shoot_block_minutes')
    .maybeSingle();
  const value = Number(setting?.value);
  return Number.isInteger(value) && value > 0 ? value : 210;
}

const postizSchema = z.object({
  accountId: z.uuid(),
  integrationId: z.string().max(200).nullable(),
});

/** Map a Postiz integration id to a client social account (SPEC §8). */
export async function mapPostizIntegration(
  input: z.input<typeof postizSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin');
  const parsed = postizSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from('client_social_accounts')
    .update({ postiz_integration_id: parsed.data.integrationId })
    .eq('id', parsed.data.accountId);
  if (error) return { ok: false, error: error.message };

  // No trigger on client_social_accounts — log explicitly (hard rule 2). This
  // mapping decides where approved content publishes, so it must be auditable.
  const { data: acct } = await supabase
    .from('client_social_accounts')
    .select('client_id')
    .eq('id', parsed.data.accountId)
    .single();
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: acct?.client_id ?? null,
      action: 'client.postiz_mapped',
      detail: {
        account_id: parsed.data.accountId,
        integration_id: parsed.data.integrationId,
      },
    });

  revalidatePath('/settings');
  return { ok: true };
}
