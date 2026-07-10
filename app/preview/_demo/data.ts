/**
 * Shared demo dataset for the credential-free client walkthrough (/preview).
 * Pure static data shaped like the real DB rows so pages can reuse the real
 * presentational components. Safe to delete with the rest of app/preview.
 */

import type { CardWithClient } from '@/lib/db/queries';
import type { Profile } from '@/lib/db/types';
import type { CardStatus } from '@/lib/status';

export const DEMO_PROFILE = {
  id: 'demo-user',
  full_name: 'Demo Yönetici',
  role: 'admin',
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
} as unknown as Profile;

export interface DemoClient {
  id: string;
  name: string;
  slug: string;
  langs: string[];
  colors: { primary: string };
  industry: string;
  district: string;
}

export const DEMO_CLIENTS: DemoClient[] = [
  {
    id: 'c1',
    name: 'Ustanın Yeri',
    slug: 'ustanin-yeri',
    langs: ['tr', 'en'],
    colors: { primary: '#e11d48' },
    industry: 'Kebap & ızgara',
    district: 'Çankaya',
  },
  {
    id: 'c2',
    name: 'Kavis Kahve',
    slug: 'kavis-kahve',
    langs: ['tr'],
    colors: { primary: '#0ea5e9' },
    industry: 'Üçüncü nesil kahve',
    district: 'Bahçelievler',
  },
  {
    id: 'c3',
    name: 'Napoli Sokağı',
    slug: 'napoli-sokagi',
    langs: ['tr', 'en'],
    colors: { primary: '#f59e0b' },
    industry: 'Pizzeria',
    district: 'Kızılay',
  },
];

const client = (id: string) => DEMO_CLIENTS.find((c) => c.id === id)!;

let n = 0;
export function demoCard(
  title: string,
  status: CardStatus,
  clientId: string,
  type: 'post' | 'reel' | 'story' | 'reply' | 'other' = 'post',
  extra: { due_at?: string; scheduled_at?: string; assignee?: string } = {},
): CardWithClient {
  n += 1;
  return {
    id: `demo-${n}`,
    client_id: clientId,
    type,
    title,
    status,
    assignee: extra.assignee ?? null,
    due_at: extra.due_at ?? null,
    scheduled_at: extra.scheduled_at ?? null,
    platforms: ['instagram'],
    priority: 3,
    tags: [],
    created_by: null,
    created_at: '2026-07-01T09:00:00Z',
    updated_at: '2026-07-06T09:00:00Z',
    clients: client(clientId),
  } as unknown as CardWithClient;
}

export const DEMO_CARDS: CardWithClient[] = [
  demoCard('Yeni yaz menüsü tanıtımı', 'idea', 'c1'),
  demoCard('Haftanın kahvesi: Fıstıklı Latte', 'idea', 'c2', 'story'),
  demoCard('Usta eli kebap hikâyesi', 'idea', 'c1', 'reel'),
  demoCard('Cumaya özel indirim kampanyası', 'copy_draft', 'c3', 'post', {
    due_at: '2026-07-10T12:00:00Z',
  }),
  demoCard('Mutfaktan kısa reel', 'visual_ready', 'c1', 'reel', {
    assignee: 'demo-user',
  }),
  demoCard('Sabah açılış hikâyesi', 'visual_ready', 'c2', 'story'),
  demoCard('Bayram menüsü duyurusu', 'translated', 'c3'),
  demoCard('Yeni şube açılışı', 'approved', 'c1'),
  demoCard('Hafta sonu brunch', 'scheduled', 'c2', 'post', {
    scheduled_at: '2026-07-12T07:30:00Z',
  }),
  demoCard('Margherita günü', 'published', 'c3'),
];

export const BOARD_STATUSES: CardStatus[] = [
  'idea',
  'copy_draft',
  'visual_ready',
  'translated',
  'approved',
  'scheduled',
  'published',
];

export const DEMO_TEAM = [
  { id: 'demo-user', name: 'Demo Yönetici', role: 'admin' },
  { id: 'u2', name: 'Elif Kaya', role: 'manager' },
  { id: 'u3', name: 'Mert Demir', role: 'member' },
];

export const DEMO_SHOOTS = [
  {
    id: 's1',
    title: 'Yaz menüsü çekimi',
    clientId: 'c1',
    status: 'confirmed' as const,
    startsAt: '2026-07-10T07:00:00Z', // 10:00 Istanbul
    endsAt: '2026-07-10T10:30:00Z',
    crew: ['Elif Kaya', 'Mert Demir'],
    vehicle: 'Beyaz Doblo',
    brief:
      'Yeni yaz menüsündeki 6 ana yemek + 3 tatlı. Doğal ışık, teras masası. Detay: közde patlıcan dumanı.',
  },
  {
    id: 's2',
    title: 'Barista arkası reel çekimi',
    clientId: 'c2',
    status: 'planned' as const,
    startsAt: '2026-07-11T11:00:00Z',
    endsAt: '2026-07-11T14:30:00Z',
    crew: ['Mert Demir'],
    vehicle: null,
    brief: 'Latte art yakın çekim + makine buharı. Dikey format.',
  },
  {
    id: 's3',
    title: 'Hamur açma videosu',
    clientId: 'c3',
    status: 'done' as const,
    startsAt: '2026-07-06T08:00:00Z',
    endsAt: '2026-07-06T11:30:00Z',
    crew: ['Elif Kaya'],
    vehicle: 'Beyaz Doblo',
    brief: 'Napoli usulü hamur açma, fırın alevi, çıtır kenar.',
  },
];

export const DEMO_VEHICLES = [
  { id: 'v1', name: 'Beyaz Doblo', plate: '06 ABC 123', capacity: 4 },
  { id: 'v2', name: 'Gri Clio', plate: '06 XYZ 789', capacity: 3 },
];

export const DEMO_LEAVES = [
  {
    person: 'Mert Demir',
    startsOn: '14.07.2026',
    endsOn: '18.07.2026',
    note: 'Yıllık izin',
  },
];

export const DEMO_PACKAGES = [
  {
    client: 'Ustanın Yeri',
    name: 'Pro Paket',
    price: '₺24.000',
    quotas: [
      { label: 'Gönderi', used: 9, quota: 12 },
      { label: 'Reel', used: 4, quota: 4 },
      { label: 'Çekim', used: 1, quota: 2 },
    ],
  },
  {
    client: 'Kavis Kahve',
    name: 'Başlangıç',
    price: '₺12.000',
    quotas: [
      { label: 'Gönderi', used: 3, quota: 8 },
      { label: 'Hikâye', used: 6, quota: 12 },
    ],
  },
  {
    client: 'Napoli Sokağı',
    name: 'Pro Paket',
    price: '₺24.000',
    quotas: [
      { label: 'Gönderi', used: 11, quota: 12 },
      { label: 'Reel', used: 2, quota: 4 },
    ],
  },
];

export const DEMO_PAYMENTS = [
  {
    client: 'Napoli Sokağı',
    title: 'Haziran paketi',
    amount: '₺18.000',
    dueOn: '01.07.2026',
    status: 'overdue' as const,
  },
  {
    client: 'Kavis Kahve',
    title: 'Ek iş: menü afişi',
    amount: '₺2.500',
    dueOn: '15.07.2026',
    status: 'pending' as const,
  },
  {
    client: 'Ustanın Yeri',
    title: 'Temmuz paketi',
    amount: '₺24.000',
    dueOn: '05.07.2026',
    status: 'paid' as const,
  },
];

export const DEMO_ADS = [
  {
    client: 'Ustanın Yeri',
    platform: 'instagram',
    objective: 'Yeni şube duyurusu — erişim',
    budget: '₺5.000',
    dates: '10–20 Tem',
    status: 'active' as const,
    results: { reach: '48.2K', clicks: 1240 },
  },
  {
    client: 'Kavis Kahve',
    platform: 'tiktok',
    objective: 'Brunch kampanyası',
    budget: '₺3.000',
    dates: '12–19 Tem',
    status: 'planned' as const,
    results: null,
  },
];

export const DEMO_SUGGESTIONS = [
  {
    id: 'sg1',
    domain: 'publish',
    domainLabel: 'Yayınlama',
    text: '"Hafta sonu brunch" yayına hazır — onaylıyor musun?',
  },
  {
    id: 'sg2',
    domain: 'post_shoot',
    domainLabel: 'Çekim sonrası görevler',
    text: '"Hamur açma videosu" çekimi bitti — kurgu/metin/kontrol görevlerini açayım mı?',
  },
  {
    id: 'sg3',
    domain: 'missing_work',
    domainLabel: 'Eksik işler',
    text: 'Napoli Sokağı: önümüzdeki 5 günde planlı içerik yok',
  },
];

export const DEMO_IDEAS = [
  {
    id: 'i1',
    title: 'Künefe videosu çekelim',
    body: 'Müşterilerimiz hep künefe soruyor, uzayan peynir çekimi çok tutar bence',
    status: 'refined' as const,
    refined: {
      title: 'Uzayan peynir: künefe reel serisi',
      summary:
        'Sıcak künefeden uzayan peynir yakın çekimi; 2 varyant — masa servisi ve şerbet dökümü. Akşam saat dilimi önerilir.',
      goal: 'Etkileşim + kaydetme',
      suggested_type: 'reel',
    },
  },
  {
    id: 'i2',
    title: 'Ramazan menüsü',
    body: 'iftar menümüzü paylaşalım',
    status: 'new' as const,
    refined: null,
  },
];

export const DEMO_AVAILABILITY = [
  { range: '10 Tem 10:00 – 14:00', note: 'Öğlen servisi öncesi uygun' },
  { range: '12 Tem 09:00 – 12:00', note: '' },
];

export const DEMO_FEED = [
  {
    action: 'Elif, "Yeni şube açılışı" kartını onaya gönderdi',
    when: '2026-07-08T14:10:00Z',
  },
  {
    action: 'Müşteri yeni fikir gönderdi: "Künefe videosu çekelim"',
    when: '2026-07-08T13:55:00Z',
  },
  { action: 'AI, müşteri fikrini özetledi', when: '2026-07-08T13:56:00Z' },
  { action: 'AI, başlık önerilerini hazırladı', when: '2026-07-08T13:02:00Z' },
  {
    action: '"Yaz menüsü çekimi" çekimi Onaylandı durumuna geçti',
    when: '2026-07-08T11:40:00Z',
  },
  {
    action: 'Mert, Bayram menüsü duyurusu metnini güncelledi',
    when: '2026-07-08T10:30:00Z',
  },
  { action: 'Kart yayınlandı 🎉', when: '2026-07-08T09:15:00Z' },
  {
    action: 'Sistem önerisi: Geciken ödeme — Napoli Sokağı',
    when: '2026-07-08T08:00:00Z',
  },
];

export const DEMO_TODAY_PLAN = [
  {
    kind: 'card',
    label: 'Mutfaktan kısa reel — kurgu teslimi',
    extra: 'Görsel hazır',
  },
  {
    kind: 'shoot',
    label: 'Yaz menüsü çekimi',
    extra: '10:00–13:30 · Ustanın Yeri',
  },
  {
    kind: 'card',
    label: 'Cumaya özel indirim kampanyası — metin',
    extra: 'Termin bugün',
  },
];
