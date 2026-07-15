'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  brandProfileSchema,
  clientColorsSchema,
  glossarySchema,
} from '@/lib/db/domain';
import { PLATFORMS } from '@/lib/db/types';
import type { ActionResult } from '@/lib/actions/cards';

const slugSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/);

const createClientSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  industry: z.string().min(1).default('restaurant'),
  langs: z
    .array(z.enum(['tr', 'en']))
    .min(1)
    .default(['tr', 'en']),
});

export async function createClientAction(
  input: z.input<typeof createClientSchema>,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole('admin'); // RLS: admin_insert_clients
  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('clients')
    .insert(parsed.data)
    .select('id')
    .single();
  if (error)
    return {
      ok: false,
      error: error.code === '23505' ? 'slugTaken' : error.message,
    };

  // No insert trigger on clients — log explicitly (hard rule 2).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: data.id,
      action: 'client.created',
      detail: { name: parsed.data.name, slug: parsed.data.slug },
    });

  revalidatePath('/clients');
  return { ok: true, data: { id: data.id } };
}

/** clients.location for route planning (production.ts toGeo reads lat/lng). */
const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  district: z.string().max(120).optional(),
  address: z.string().max(400).optional(),
});

const updateClientSchema = z.object({
  clientId: z.uuid(),
  name: z.string().min(1).max(120).optional(),
  industry: z.string().min(1).optional(),
  langs: z
    .array(z.enum(['tr', 'en']))
    .min(1)
    .optional(),
  active: z.boolean().optional(),
  brandProfile: brandProfileSchema.optional(),
  glossary: glossarySchema.optional(),
  hashtagBank: z.array(z.string()).optional(),
  colors: clientColorsSchema.optional(),
  logoAssetId: z.uuid().nullable().optional(),
  /** null clears the saved location. */
  location: locationSchema.nullable().optional(),
});

export async function updateClientAction(
  input: z.input<typeof updateClientSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager'); // RLS: mgr_write_clients
  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { clientId, ...f } = parsed.data;

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from('clients')
    .update({
      ...(f.name !== undefined && { name: f.name }),
      ...(f.industry !== undefined && { industry: f.industry }),
      ...(f.langs !== undefined && { langs: f.langs }),
      ...(f.active !== undefined && { active: f.active }),
      ...(f.brandProfile !== undefined && { brand_profile: f.brandProfile }),
      ...(f.glossary !== undefined && { glossary: f.glossary }),
      ...(f.hashtagBank !== undefined && { hashtag_bank: f.hashtagBank }),
      ...(f.colors !== undefined && { colors: f.colors }),
      ...(f.logoAssetId !== undefined && { logo_asset_id: f.logoAssetId }),
      ...(f.location !== undefined && { location: f.location ?? {} }),
    })
    .eq('id', clientId);
  if (error) return { ok: false, error: error.message };

  // No update trigger on clients — log explicitly (hard rule 2). Record which
  // fields changed, not the values (brand profile / glossary can be large).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: clientId,
      action: 'client.updated',
      detail: { fields: Object.keys(f) },
    });

  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function deleteClientAction(
  clientId: string,
): Promise<ActionResult> {
  await requireRole('admin');
  if (!z.uuid().safeParse(clientId).success)
    return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from('clients').delete().eq('id', clientId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/clients');
  return { ok: true };
}

const accountSchema = z.object({
  clientId: z.uuid(),
  platform: z.enum(PLATFORMS),
  handle: z.string().min(1).max(120),
});

export async function addSocialAccountAction(
  input: z.input<typeof accountSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from('client_social_accounts').insert({
    client_id: parsed.data.clientId,
    platform: parsed.data.platform,
    handle: parsed.data.handle,
  });
  if (error) return { ok: false, error: error.message };

  // No trigger on client_social_accounts — log explicitly (hard rule 2).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: parsed.data.clientId,
      action: 'client.account_added',
      detail: { platform: parsed.data.platform, handle: parsed.data.handle },
    });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true };
}

export async function removeSocialAccountAction(
  accountId: string,
  clientId: string,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from('client_social_accounts')
    .delete()
    .eq('id', accountId);
  if (error) return { ok: false, error: error.message };

  // No trigger on client_social_accounts — log explicitly (hard rule 2).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: clientId,
      action: 'client.account_removed',
      detail: { account_id: accountId },
    });

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
