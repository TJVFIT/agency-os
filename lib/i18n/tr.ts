/**
 * Turkish UI strings — the only user-facing language in v1 (CLAUDE.md rule 7).
 * Structured so an `en.ts` can later mirror it: implement `Translation`
 * (same shape, every leaf a string) and switch modules per user preference.
 *
 * Keep keys in English, values in Turkish. Interpolation slots use {name}.
 */

export const tr = {
  common: {
    save: 'Kaydet',
    cancel: 'Vazgeç',
    delete: 'Sil',
    edit: 'Düzenle',
    create: 'Oluştur',
    search: 'Ara',
    filter: 'Filtrele',
    loading: 'Yükleniyor…',
    processing: 'İşleniyor…',
    error: 'Bir hata oluştu',
    retry: 'Tekrar dene',
    close: 'Kapat',
    confirm: 'Onayla',
    yes: 'Evet',
    no: 'Hayır',
  },

  auth: {
    login: 'Giriş yap',
    logout: 'Çıkış yap',
    email: 'E-posta',
    password: 'Şifre',
    loginFailed: 'Giriş başarısız — e-posta veya şifre hatalı',
  },

  nav: {
    dashboard: 'Panel',
    board: 'Pano',
    calendar: 'Takvim',
    clients: 'Müşteriler',
    assets: 'Medya',
    reports: 'Raporlar',
    settings: 'Ayarlar',
  },

  statuses: {
    idea: 'Fikir',
    copy_draft: 'Metin taslağı',
    visual_ready: 'Görsel hazır',
    translated: 'Çevrildi',
    approved: 'Onaylandı',
    scheduled: 'Zamanlandı',
    published: 'Yayınlandı',
    archived: 'Arşivlendi',
  },

  roles: {
    admin: 'Yönetici',
    manager: 'Müdür',
    member: 'Üye',
  },

  cardTypes: {
    post: 'Gönderi',
    reel: 'Reel',
    story: 'Hikâye',
    reply: 'Yanıt',
    other: 'Diğer',
  },

  // Human-readable messages for lib/status.ts TransitionReason codes.
  statusReasons: {
    same_status: 'Kart zaten bu durumda',
    unknown_transition: 'Bu durum geçişine izin verilmiyor',
    archived_is_terminal: 'Arşivlenmiş kartlar değiştirilemez',
    translation_skipped_single_lang: 'Tek dilli müşteride çeviri adımı atlanır',
    translation_required: 'Onaydan önce çeviri adımı tamamlanmalı',
    approve_requires_manager: 'Onaylama yetkisi müdür ve yöneticilere aittir',
    reject_requires_manager: 'Reddetme yetkisi müdür ve yöneticilere aittir',
    publish_requires_service_role:
      'Yayınlama yalnızca sistem tarafından yapılır',
    schedule_requires_future_date: 'Zamanlama için ileri bir tarih seçilmeli',
    schedule_requires_platform: 'En az bir platform seçilmeli',
  },

  card: {
    newCard: 'Yeni kart',
    title: 'Başlık',
    client: 'Müşteri',
    assignee: 'Sorumlu',
    dueDate: 'Termin',
    scheduledAt: 'Yayın zamanı',
    platforms: 'Platformlar',
    priority: 'Öncelik',
    comments: 'Yorumlar',
    sendForApproval: 'Onaya gönder',
    approve: 'Onayla',
    reject: 'Reddet',
    rejectReason: 'Reddetme nedeni',
  },

  ai: {
    generateCaptions: '3 başlık üret',
    translate: 'Çevir',
    draftReply: 'Yanıt taslağı',
    pending: 'İşleniyor…',
    failed: 'AI işlemi başarısız oldu',
  },

  feed: {
    title: 'Canlı akış',
    empty: 'Henüz aktivite yok',
  },
} as const;

/** Deep shape of the strings module with every leaf widened to `string` —
 * `en.ts` must satisfy this to guarantee key parity. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Translation = Widen<typeof tr>;
