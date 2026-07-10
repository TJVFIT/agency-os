/**
 * Shared demo constants for the credential-free client walkthrough
 * (/preview). Only the demo persona and the fictional agency team remain —
 * every client, card, shoot, package, payment, ad and feed entry is entered
 * by the visitor and lives in the demo store (see store.tsx). Safe to delete
 * with the rest of app/preview.
 */

import type { Profile } from '@/lib/db/types';

export const DEMO_PROFILE = {
  id: 'demo-user',
  full_name: 'Demo Yönetici',
  role: 'admin',
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
} as unknown as Profile;

export const DEMO_TEAM = [
  { id: 'demo-user', name: 'Demo Yönetici', role: 'admin' },
  { id: 'u2', name: 'Elif Kaya', role: 'manager' },
  { id: 'u3', name: 'Mert Demir', role: 'member' },
];
