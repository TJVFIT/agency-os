/**
 * Zod schemas for the JSONB columns (SPEC §3) — the single place that
 * defines their shape. Forms validate input with these; the worker
 * validates what it reads before handing data to prompts.
 */

import { z } from 'zod';

export const brandProfileSchema = z.object({
  voice: z.string().default(''),
  tone_rules: z.array(z.string()).default([]),
  banned_words: z.array(z.string()).default([]),
  signature_items: z.array(z.string()).default([]),
  emoji_ok: z.boolean().default(true),
  sample_captions: z.array(z.string()).default([]),
});
export type BrandProfile = z.infer<typeof brandProfileSchema>;

export const glossaryEntrySchema = z.object({
  term: z.string().min(1),
  rule: z.enum(['keep', 'translate_to']),
  value: z.string().optional(),
});
export const glossarySchema = z.array(glossaryEntrySchema);
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;

export const clientColorsSchema = z.object({
  primary: z.string().optional(),
  secondary: z.string().optional(),
});
export type ClientColors = z.infer<typeof clientColorsSchema>;

/** clients.contact — portal-editable company info (migration 0009). */
export const clientContactSchema = z.object({
  phone: z.string().max(40).default(''),
  email: z.string().max(120).default(''),
  address: z.string().max(300).default(''),
  district: z.string().max(80).default(''),
  website: z.string().max(200).default(''),
  instagram: z.string().max(80).default(''),
  hours: z.string().max(200).default(''),
  notes: z.string().max(1000).default(''),
});
export type ClientContact = z.infer<typeof clientContactSchema>;

/** assets.variants — R2 keys per rendition (SPEC §7.1). */
export const assetVariantsSchema = z.object({
  square: z.string().optional(),
  portrait: z.string().optional(),
  story: z.string().optional(),
  thumb: z.string().optional(),
});
export type AssetVariants = z.infer<typeof assetVariantsSchema>;

export function parseBrandProfile(json: unknown): BrandProfile {
  const parsed = brandProfileSchema.safeParse(json ?? {});
  return parsed.success ? parsed.data : brandProfileSchema.parse({});
}

export function parseGlossary(json: unknown): GlossaryEntry[] {
  const parsed = glossarySchema.safeParse(json ?? []);
  return parsed.success ? parsed.data : [];
}

export function parseAssetVariants(json: unknown): AssetVariants {
  const parsed = assetVariantsSchema.safeParse(json ?? {});
  return parsed.success ? parsed.data : {};
}

export function parseClientContact(json: unknown): ClientContact {
  const parsed = clientContactSchema.safeParse(json ?? {});
  return parsed.success ? parsed.data : clientContactSchema.parse({});
}
