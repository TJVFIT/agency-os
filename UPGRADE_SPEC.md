# Agency OS v2 — Upgrade Spec (client requirements → build plan)

Source: client requirements doc (items 22–40 + "Nihai Çalışma Mantığı" flow +
"Nihai Ürün Tanımı"). This document maps every requirement to what already
exists, what gets extended, and what is new. Read with SPEC.md (v1) —
where they conflict, this file wins for v2 scope.

Budget rule unchanged: **$0/month infra.** Every addition below fits the
existing free tiers. Deviations and their tradeoffs are flagged inline.

---

## 1. Requirement map

| #   | Requirement                        | Status         | Where                                              |
| --- | ---------------------------------- | -------------- | -------------------------------------------------- |
| 22  | Müşteri onay + revize              | EXISTS, extend | /approve/[token] → full portal (§2)                |
| 23  | Instagram bağlama                  | EXISTS         | Postiz integrations + settings mapping             |
| 24  | Instagram oto paylaşım             | EXISTS         | publish dispatcher (worker/src/cron.ts)            |
| 25  | TikTok bağlama                     | EXISTS         | same Postiz path (platform `tiktok`)               |
| 26  | TikTok doğrudan/taslak             | EXTEND         | publish payload gains `draft` option               |
| 27  | Paylaşım hataları takibi           | EXISTS, extend | activity `publish.failed` → dashboard widget       |
| 28  | Başarısız paylaşım retry           | EXISTS         | queue backoff ×5 + dispatcher re-enqueue           |
| 29  | Paylaşım öncesi uygunluk kontrolü  | NEW            | lib/compliance.ts, dispatcher gate (§5)            |
| 30  | Günlük/haftalık görev planları     | NEW            | daily 08:00 cron + dashboard "Bugünün planı" (§6)  |
| 31  | Eksik işler tespiti                | EXTEND         | gap radar → eksik-işler detector (§6)              |
| 32  | Reklam yönetimi (v1)               | NEW            | ad_tasks module (§7) — tracking workflow           |
| 33  | Paket + kota takibi (v1)           | NEW            | client_packages + usage (§7)                       |
| 34  | Ödeme + ek iş takibi (v1)          | NEW            | payments (package/extra) (§7)                      |
| 35  | Otomatik raporlama (v1)            | EXTEND         | Friday report pulls publish counts, kota, ödemeler |
| 36  | PWA kurulum                        | NEW            | manifest + service worker (§8)                     |
| 37  | Push bildirimleri                  | NEW            | web-push (VAPID) + push_subscriptions (§8)         |
| 38  | Her işlem loglanır                 | EXISTS, extend | activity triggers on all new tables                |
| 39  | Öneri / yarı / tam otomatik modlar | NEW            | automation_settings + suggestions inbox (§9)       |
| 40  | Otomasyonu kapatma (manuel mod)    | NEW            | master switch in automation_settings (§9)          |

Flow steps (bölüm 24): 1–3 → client portal ideas + AI refine/scenario (§2, §4);
4 → scenario output `needs_shoot`; 5 → portal müsaitlik (§2); 6 → scheduling
engine suggestions (§3); 7–10 → shoots module + brief notify (§3); 11 →
post-shoot auto tasks (kurgu/metin/kontrol cards) (§3); 12–14 → existing
status machine + portal approval; 15 → Postiz publish; 16 → publish result
check (exists) + compliance (§5); 17 → ad task creation (§7); 18 → monthly
report roll-up (§7).

---

## 2. Client portal (extends approval links)

- `portal_links`: durable per-client token (revocable), separate from weekly
  `approval_links`. Public page `/portal/[token]` (service role after token
  check, rate-limited, noindex — same hardening as /approve).
- Tabs: **Onay** (pending cards, approve/reject+comment — same engine as
  /approve), **Fikir gönder** (→ `client_ideas`, auto-enqueues `idea_refine`),
  **Müsaitlik** (→ `client_availability` windows).
- Agency side: /clients/[id] gains portal-link management + **Fikir kutusu**
  (ideas inbox: AI-refined summary, accept → card + `scenario` job, reject).

## 3. Production module (shoots, crew, vehicles, routes)

- Tables: `vehicles`, `staff_leaves`, `shoots` (client, optional card, brief,
  210-min default block, crew uuid[], vehicle, location jsonb, status
  planned→confirmed→done/cancelled), `clients.location` (lat/lng/district).
- `lib/scheduling/` (pure, unit-tested): `suggestShootSlots()` ranks candidate
  blocks honoring müsaitlik windows, staff leaves, no double-booking of crew
  or vehicle; `suggestRoute()` orders a day's shoots nearest-neighbor by
  haversine (total km + ETA at 40 km/h). _Deviation flag: no paid Maps API —
  straight-line heuristic, good enough for intra-Ankara planning._
- /production page: Çekimler (list + create + confirm + assign from
  suggestions), Araçlar, İzinler.
- Shoot → `confirmed`: brief Telegram/push to crew. Shoot → `done`: auto-open
  kurgu/metin/kontrol cards linked to the client (automation-mode aware, §9).

## 4. AI pipeline extensions

- New `ai_jobs` kinds: `idea_refine` (fikri sadeleştir → title/summary/goal),
  `scenario` (senaryo + çekim brief + `needs_shoot` + shot list), `poster`
  (afiş görseli), `compliance` (AI-assisted pre-publish check, optional layer).
- Prompts in lib/ai/prompts.ts (same JSON+zod regime); worker handlers in
  worker/src/handlers/creative.ts.
- **Poster**: provider chain like text — Gemini image generation (free tier)
  first; **Higgsfield** (ported from ai-workforce `skills/higgsfield.py`) as
  optional second provider when HIGGSFIELD_API_KEY/SECRET are set. Output →
  R2 asset `source='ai'` attached to the card. _Flag: Gemini image free tier
  is low-RPM; poster jobs queue like everything else._

## 5. Pre-publish compliance gate (req 29)

- `lib/compliance.ts` (pure, tested): caption present per lang, banned words
  (brand profile), platform length limits, hashtag count, media attached,
  scheduled time sanity. Dispatcher runs it before creating the `publish`
  job; failures → card error badge + suggestion/notification instead of send.

## 6. Task automation (req 30–31)

- Daily 08:00 cron: per-staff günlük plan (due/overdue cards, today's shoots)
  → Telegram + push + dashboard "Bugünün planı" panel. Monday: haftalık plan
  digest to managers (accompanies existing planner).
- Eksik işler detector (daily): stuck cards (status-age thresholds), shoots
  `done` without opened tasks, scheduled cards failing compliance, overdue
  payments → `suggestions` rows + manager notification.

## 7. Business ops (req 32–35)

- `client_packages` (monthly quotas: post/reel/story/çekim + price) with
  usage computed from published cards per month → kota bars on /finance and
  client page.
- `payments` (kind package|extra, due/paid, overdue detection).
- `ad_tasks` (platform, budget, dates, objective, status, results jsonb).
  _Deviation flag: v2 = reklam iş takibi (workflow + hatırlatma + rapor).
  Meta/TikTok Ads API'den otomatik kampanya açma, işletme doğrulaması ve
  bütçe gerektirir — $0 kapsamı dışında; ileride eklenebilir._
- Friday report: metrics auto-filled (publish counts from activity_log, kota
  kullanımı, ödeme durumu) before the LLM writes body_md.

## 8. PWA + push (req 36–37)

- `app/manifest.ts` + icons + `public/sw.js` (push → notification, focus/open
  on click). Install prompt hint on /settings.
- `push_subscriptions` table; subscribe component on /settings; worker
  notification dispatcher fans out to Telegram AND web-push (VAPID keys in
  env). _Flag: iOS push requires the PWA to be installed to home screen._

## 9. Automation modes (req 39–40)

- `automation_settings` (key → mode: `suggest` | `semi` | `full`): master +
  per-domain (planner, publish, post_shoot, compliance, reports). Effective
  mode = min(master, domain).
- `suggest`: worker never acts — writes a `suggestions` row (Öneriler inbox
  on dashboard; accept executes, dismiss archives).
- `semi` (default): worker acts for safe steps (task opening, plans) but
  publishing still requires human-approved cards only (status machine
  unchanged — approval is ALWAYS human/client, in every mode).
- `full`: everything automated end-to-end (still only `approved` content
  publishes — hard rule 1 is not mode-dependent).
- /settings gains an Otomasyon section (admin only). Every automated action
  logs to activity_log with actor=NULL + detail.mode.

## 10. Out of scope for v2 (explicit)

- Ads API automation (see §7 flag). Analytics ingestion from platforms
  (Postiz analytics — Phase 5). Multi-language UI (en.ts shape ready).
  Route optimization beyond nearest-neighbor.

## 11. New env

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  (web push — generate once with `npx web-push generate-vapid-keys`).
- `HIGGSFIELD_API_KEY`, `HIGGSFIELD_API_SECRET` (optional poster provider).
