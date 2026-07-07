# Agency OS — Technical Specification (v1.0)

Internal tool for a social media agency. One web app + one worker process.
Everything runs on free tiers. Read together with CLAUDE.md (rules) and
BUILD_PHASES.md (order of implementation).

---

## 1. Product overview

**Core loop:** every piece of work is a **card** that moves through a pipeline.
When a worker moves a card, everyone sees it instantly (Realtime) and the next
person's queue updates. AI assists at four points: caption writing, client
reply drafting, TR↔EN translation, and media processing (image variants,
background removal, captioned reels).

**Users & roles** (`profiles.role`):

- `admin` — everything + user management + client management + settings
- `manager` — everything on cards/clients except user management; can approve
- `member` — create/edit cards, upload assets, run AI actions, comment;
  cannot approve, cannot delete clients

**Clients** are the agency's customers (restaurants, cafes…). Each client has a
brand profile, glossary, hashtag bank, connected social accounts, and language
set (default `["tr","en"]`; single-language clients skip the translation step).

---

## 2. Infrastructure map (free tiers — hard constraints)

| Piece                 | Service                                                                                              | Free limit that matters                    | Consequence for design                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| App + worker + Postiz | Oracle Cloud Always Free (Ampere ARM, ~2 OCPU / 12 GB after June 2026 nerf, 200 GB disk) via Coolify | one box runs everything                    | keep worker memory-lean: whisper `small`/`base` int8, one FFmpeg job at a time |
| DB / Auth / Realtime  | Supabase Free                                                                                        | 500 MB DB, Realtime included               | no media in DB; prune `activity_log` > 12 months via cron                      |
| Media                 | Cloudflare R2 Free                                                                                   | 10 GB storage, free egress                 | store originals + variants; lifecycle-delete raw reel inputs after 30 days     |
| LLM                   | Gemini Flash / Flash-Lite free tier                                                                  | ~10–15 RPM, ~250–1,500 req/day per project | queue + token bucket; two Google projects (KEY_A drafting, KEY_B translation)  |
| LLM fallback          | Groq free tier, OpenRouter `:free` models                                                            | rate limited                               | provider chain, §6.2                                                           |
| Transcription         | faster-whisper local (CPU) or Groq Whisper free                                                      | CPU time                                   | reels queue serially                                                           |
| Translation alt       | DeepL API Free                                                                                       | 500k chars/month                           | optional secondary engine                                                      |
| Publishing            | Postiz self-hosted                                                                                   | —                                          | agency creates its own platform apps once (SETUP.md)                           |
| Notifications         | Telegram Bot API                                                                                     | free                                       | primary notification channel                                                   |

**Privacy note:** Gemini free tier may use inputs to improve Google's models.
Captions/replies are fine; the app must never send credentials, contracts, or
personal data of end customers to the LLM.

---

## 3. Data model

Authoritative DDL in `schema.sql` (repo root → first Supabase migration).
Summary of tables and intent:

- **profiles** — mirrors `auth.users` (trigger-created). `role`,
  `telegram_chat_id`, `full_name`.
- **clients** — `name`, `slug`, `industry`, `langs text[]`,
  `brand_profile jsonb` `{voice, tone_rules[], banned_words[],
signature_items[], emoji_ok, sample_captions[]}`,
  `glossary jsonb` (array of `{term, rule: "keep"|"translate_to", value?}`),
  `hashtag_bank text[]`, `colors jsonb`, `logo_asset_id`, `active`.
- **client_social_accounts** — `client_id`, `platform`
  (`instagram|facebook|tiktok|x|youtube|linkedin`), `handle`,
  `postiz_integration_id` (nullable until publishing configured).
- **cards** — the work item. `client_id`, `type`
  (`post|reel|story|reply|other`), `title`, `status` (§5), `assignee`,
  `due_at`, `scheduled_at`, `platforms text[]`, `priority smallint`,
  `created_by`, timestamps.
- **card_contents** — one row per `(card_id, lang)`. `caption text`,
  `hashtags text[]`, `media_asset_ids uuid[]`. Edits overwrite; history is
  reconstructable from `activity_log.detail`.
- **assets** — `client_id`, `kind` (`image|video|other`), `r2_key`,
  `original_name`, `width/height/duration_s`, `variants jsonb`
  (`{square, portrait, story, thumb}` → R2 keys), `source`
  (`upload|telegram|ai|render`), `uploaded_by`.
- **comments** — per card, plain text + optional `asset_id` attachment.
- **activity_log** — `actor` (nullable = system), `client_id`, `card_id`,
  `action` (e.g. `card.status_changed`, `content.updated`, `ai.caption_done`,
  `publish.success`), `detail jsonb`. Realtime-enabled. This table IS the
  live feed.
- **ai_jobs** — the queue. `kind` (`caption|translate|reply|plan|report|
image_variants|bg_remove|render_reel|publish`), `payload jsonb`,
  `status` (`queued|running|done|error`), `result jsonb`, `error`,
  `attempts`, `run_after`, `created_by`.
- **approval_links** — `client_id`, `token` (unguessable, 32+ bytes,
  base64url), `week_start date`, `expires_at`.
- **approval_actions** — `approval_link_id`, `card_id`, `decision`
  (`approved|rejected`), `comment`, `created_at`.
- **reports** — `client_id`, `week_start`, `body_md`, `metrics jsonb`.

Retention: cron deletes `activity_log` rows older than 12 months and
`ai_jobs` in terminal states older than 60 days.

---

## 4. Auth & RLS

- Supabase Auth, email + password (invites created by admin; no public
  signup — `auth.users` insert restricted, admin uses service role invite).
- `profiles` row auto-created by trigger on signup; default role `member`.
- **RLS policies (internal-team model):**
  - all tables: `SELECT` for any authenticated user with a profile
  - `INSERT/UPDATE` on cards, card_contents, comments, assets, ai_jobs:
    any authenticated profile
  - status transition into `approved`: enforced by a `BEFORE UPDATE`
    trigger — only `manager|admin` (or the service role, for magic-link
    approvals) may set it (§5)
  - `clients`, `client_social_accounts`, user management, `DELETE`
    anywhere: `admin` (managers may update client brand/glossary/hashtags)
  - `approval_links/actions`, `reports`: written by service role
    (worker/server routes); readable by authenticated users
- Public approval pages never query with the anon key. Server route
  validates token + expiry, uses service role, returns only that client's
  pending cards.

---

## 5. Status machine (cards)

```
idea → copy_draft → visual_ready → [translated] → approved → scheduled → published
                                                      ↘ (reject) → copy_draft
any → archived
```

Rules:

- `translated` is skipped when `array_length(client.langs) = 1`.
- Only `manager|admin` or a valid approval-link action can set `approved`.
- Entering `scheduled` requires `scheduled_at` (future) and ≥1 platform;
  side effect: enqueue nothing yet — the dispatcher cron picks it up (§8).
- `published` is set only by the publish worker on Postiz success.
- A reject (from approval UI or magic link) moves the card to `copy_draft`
  and stores the comment on the card thread.
- Every transition: `activity_log` row (trigger) + Telegram notification to
  the relevant person (worker listens to the log): new assignee, "waiting on
  you", approval granted/rejected, publish success/failure.

Implement as a pure function in `lib/status.ts`:
`canTransition(role, from, to, ctx) → { ok, reason? }` — used by the server
action AND mirrored in the DB trigger. Unit-test every edge.

---

## 6. AI layer

### 6.1 Queue

UI/server actions insert into `ai_jobs`; the worker polls
(`FOR UPDATE SKIP LOCKED`, batch 1–3, every 2 s), executes, writes `result`,
flips status, and emits an `activity_log` row → Realtime pushes the outcome
into the open card view. Backoff: `run_after = now() + (2^attempts) minutes`,
max 5 attempts.

### 6.2 Provider router (`lib/ai/router.ts`)

Ordered chain, first healthy provider wins; on 429/5xx/timeout → next:

1. `gemini-flash` (KEY_A — drafting kinds: caption, reply, plan, report)
2. `gemini-flash` (KEY_B — translate kind gets its own project/key)
3. `gemini-flash-lite` (same keys, cheaper limits pool)
4. `groq` (llama current free model)
5. `openrouter` (a configured `:free` model)

Token bucket per provider key: 1 request / 5 s sustained, burst 3. All calls
`response_format: JSON` (or prompt-enforced JSON), zod-validated; one repair
retry ("return ONLY valid JSON matching the schema") before failing the job.
Log provider + latency into `ai_jobs.result._meta`.

### 6.3 Prompts (`lib/ai/prompts.ts`) — implement verbatim, params in {braces}

**CAPTION_SYSTEM**

```
You are the senior Turkish social media copywriter for the client below.
Write in natural, native Turkish (Türkçe). Never sound machine-translated.
CLIENT BRAND PROFILE: {brand_profile_json}
HASHTAG BANK (choose 3–6 relevant, may add 1–2 new): {hashtag_bank}
BANNED WORDS: {banned_words}
Platform: {platform}. Card brief: {brief}.
Return ONLY JSON: {"variants":[{"caption":string,"hashtags":string[]},
{"caption":string,"hashtags":string[]},{"caption":string,"hashtags":string[]}]}
Rules: 3 distinct angles (ör. iştah açıcı betimleme / kampanya-CTA /
soru-etkileşim). Respect emoji_ok. Caption ≤ {max_chars} chars. No hashtags
inside caption text.
```

**TRANSLATE_SYSTEM**

```
You are a transcreation specialist for restaurant/cafe marketing between
Turkish and English. Do NOT translate literally — recreate the marketing
effect for a native reader of the target language.
GLOSSARY (obey exactly): {glossary_json}
Keep: emoji, line breaks, @mentions, prices and currency as-is.
Hashtags: keep brand hashtags untouched; localize generic ones only if a
clearly better native tag exists.
Source language: {src}. Target language: {tgt}.
TEXT: {text}
Return ONLY JSON: {"translation":string,"notes":string}
"notes" = one short line flagging anything a human should double-check
(wordplay lost, cultural reference, price/claim), else "".
```

**REPLY_SYSTEM**

```
You draft replies that an agency sends on behalf of the client below.
Voice: {brand_profile_json}. Language: reply in the language of the incoming
message. Be warm, concise (≤ 2 sentences unless a complaint), never make
promises about refunds/compensation — offer to take it to DM/phone instead.
INCOMING MESSAGE: {message}
CONTEXT (optional): {context}
Return ONLY JSON: {"reply":string,"escalate":boolean,"escalate_reason":string}
Set escalate=true for: complaints about health/safety, legal threats,
influencer/press inquiries, anything about money.
```

**PLANNER_SYSTEM**

```
You are the content strategist. Propose next week's content for the client.
CLIENT: {brand_profile_json}. Langs: {langs}. Platforms: {platforms}.
RECENT TOP POSTS (may be empty): {top_posts_json}
UPCOMING CONTEXT: week of {week_start}; note Turkish holidays/special days
in that week if any.
Return ONLY JSON: {"ideas":[{"title":string,"type":"post"|"reel"|"story",
"brief":string,"suggested_day":"Mon".."Sun"} x5]}
Briefs must be concrete enough that a copywriter can draft without asking
questions (dish/offer/angle specified).
```

**REPORT_SYSTEM**

```
You write the weekly client report in Turkish. Audience: a busy restaurant
owner — plain language, no marketing jargon, no invented numbers.
DATA (JSON): {metrics_json}   ← published posts + per-post stats + deltas
Return ONLY JSON: {"body_md":string}
Structure of body_md: 3–5 bullet highlights, "Bu hafta ne öğrendik" (2–3
cümle), "Önümüzdeki hafta önerimiz" (2–3 madde). ≤ 250 words. If DATA is
sparse, say so honestly instead of padding.
```

---

## 7. Media pipeline (worker)

### 7.1 Upload & image variants

1. Client → `POST /api/assets/presign` → server returns R2 presigned PUT.
2. Browser uploads directly to R2; then `POST /api/assets/complete` creates
   the `assets` row and enqueues `image_variants`.
3. Worker (sharp): generate `square 1080×1080`, `portrait 1080×1350`,
   `story 1080×1920` (cover-crop, attention-based), `thumb 400w`; watermark
   client logo bottom-right at 6% width, 24 px inset (skip if no logo);
   upload variants, update `assets.variants`.
4. `bg_remove` job: shell out to `rembg i in.png out.png` (CPU); output is a
   new asset with `source='ai'`.

### 7.2 Reel pipeline (`render_reel` payload: `{card_id, asset_id, langs[]}`)

1. Download source from R2. `ffprobe` sanity check (≤ 3 min, has audio).
2. Transcribe: faster-whisper `small` int8 CPU with word timestamps
   (fallback: Groq Whisper if local unavailable).
3. Build ASS subtitles: karaoke style, 2–3 words per event, ≥ 64 pt bold,
   white + client primary-color highlight (`\k` tags), safe-area bottom
   third, `PlayResY=1920`. Generator = pure function in
   `worker/lib/ass.ts` (unit-tested).
4. FFmpeg single pass: scale+crop to 1080×1920 (center-weighted),
   `subtitles=` burn-in, overlay logo PNG top-right 5% width, `-c:v libx264
-preset veryfast -crf 23 -c:a aac`, faststart.
5. If `langs` includes `en`: translate segment texts via router
   (TRANSLATE_SYSTEM, batched) and render a second output.
6. Upload MP4(s) to R2, create asset rows `source='render'`, attach to the
   card's `card_contents.media_asset_ids` per lang, log + Telegram notify.
7. Concurrency 1; delete temp files in `finally`.

---

## 8. Publishing (Postiz)

- Env: `POSTIZ_URL`, `POSTIZ_API_KEY`. Mapping: `client_social_accounts.
postiz_integration_id` ↔ Postiz integrations (admin settings page lists
  Postiz integrations via its API and lets admin link them to accounts).
- **Dispatcher cron (worker, every 60 s):** select cards
  `status='scheduled' AND scheduled_at <= now()` → re-verify an approval
  exists → for each platform build payload (caption for that platform's lang
  priority: platform-specific override later; v1 = TR caption + hashtags
  appended, media = public R2 URLs of the chosen variants) → Postiz create
  post (immediate) → on success set `published`, store Postiz post ids in
  `activity_log.detail`; on failure `attempts++`, retry ×3, then flag card
  `error` badge + Telegram alert to managers.
- v1 does NOT fetch analytics automatically; the Friday report uses whatever
  metrics exist in `reports.metrics` (manual entry form on the client page)
  — Postiz analytics endpoints can be wired in a later phase.

---

## 9. Telegram bot (worker, grammY)

- `/start` → explains linking. `/link <code>` → codes generated on the user's
  settings page (10-min expiry) → binds `telegram_chat_id`.
- **Notifications:** card assigned to you; card entered a status your role
  acts on; approval granted/rejected (with comment); publish success/failure;
  Friday report ready (link); gap-radar alerts to managers.
- **Media intake:** photo/video received → inline keyboard of active clients
  → chosen → download from Telegram (≤ 20 MB bot API limit; larger: reply
  asking to upload via web) → push to R2 → create asset (`source='telegram'`)
  → enqueue `image_variants` → confirm with thumbnail.
- **Inline approve:** managers receive approval requests with
  Approve / Reject buttons (Reject asks for a one-line reason).

---

## 10. Client approval magic links

- Manager clicks "Onaya gönder" on the calendar week → server creates
  `approval_links` (token = 32 random bytes base64url, expiry 7 days) →
  copies WhatsApp-ready message with URL `/approve/{token}`.
- Public page (server-rendered, service role after token check): client logo,
  week's cards awaiting approval — media preview (portrait variant), caption
  with TR/EN tabs, per-card Approve ✓ / Reject ✗ + comment box, and
  "Hepsini onayla". Actions write `approval_actions`, transition cards, log.
  Mobile-first; no login; token in URL only (add `robots: noindex`).

---

## 11. Cron jobs (worker, node-cron, Europe/Istanbul)

| When        | Job                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Mon 09:00   | PLANNER per active client → 5 `idea` cards (tag `ai-planned`; skip if client already has ≥5 non-archived ideas) |
| Fri 17:00   | REPORT per active client → `reports` row + Telegram link to managers                                            |
| daily 10:00 | **Gap radar:** clients with 0 cards in `scheduled                                                               | approved` for next 5 days → red flag on dashboard + Telegram to managers |
| daily 03:00 | Retention pruning (§3) + R2 lifecycle sweep for raw reel inputs                                                 |
| every 60 s  | Publish dispatcher (§8)                                                                                         |
| every 2 s   | ai_jobs poll loop (not cron; main worker loop)                                                                  |

Recycling (top-post resurfacing) is Phase-4 optional: mark evergreen cards,
resurface 60–90 days after publish as a new `idea`.

---

## 12. Routes / pages (App Router)

```
/login
/(app)/dashboard      my queue • gap radar • live activity feed
/(app)/board          kanban by status; filters: client, assignee, type
/(app)/calendar       month/week; drag to reschedule (updates scheduled_at/due_at)
/(app)/clients        list + create (admin/manager)
/(app)/clients/[id]   brand profile • glossary • hashtag bank • accounts •
                      metrics entry • reports history
/(app)/cards/[id]     the workroom: TR/EN content tabs, AI buttons
                      (3 caption variants → pick/edit; Translate; Draft reply),
                      media picker (variant chooser), comments, status controls,
                      schedule dialog (datetime + platforms)
/(app)/assets         library; filters client/kind/source; upload; bg-remove;
                      "make reel" action on videos
/(app)/reports        list by client/week
/(app)/settings       profile + Telegram link code; admin: users, Postiz
                      integration mapping, provider health (last success per
                      AI provider, queue depth)
/approve/[token]      public approval page (§10)
/api/assets/presign • /api/assets/complete • /api/telegram/webhook (if
webhook mode; polling is fine v1)
```

**UI notes:** Turkish strings from `lib/i18n/tr.ts`. Live feed = right-side
drawer on desktop, tab on mobile, subscribed to `activity_log` inserts with
human-readable rendering per `action`. Card badges: language completeness
(TR ✓ / EN –), media attached, error state. Keep the design clean and dense —
this is a tool, not a marketing site.

---

## 13. Realtime

Supabase Realtime (postgres_changes) on: `activity_log` (INSERT → feed +
toasts), `cards` (UPDATE → board/calendar patch in place), `ai_jobs`
(UPDATE where `created_by = me` → resolve pending AI button states).
Single channel per logged-in session; debounce re-renders.

---

## 14. Ops & non-functional

- Deploy: Coolify on the Oracle box — app (Next.js, build via Nixpacks/Docker),
  worker (Dockerfile, pm2), Postiz (its docker-compose). Supabase is cloud.
- Health: `/api/health` (app) and worker heartbeat row (`activity_log`
  `action='worker.heartbeat'` every 5 min); dashboard shows worker liveness.
- Backups: nightly `pg_dump` via Supabase CLI from the box to R2 (cron),
  keep 14 days.
- Logs: pino JSON to stdout (Coolify captures).
- Performance targets: board/calendar interactive < 1.5 s on the box;
  AI caption round-trip typically < 20 s including queue wait; reel render
  ≤ ~2× video duration on 2 OCPU.
- Security: rate-limit public approval route (per-IP, in-memory), noindex,
  CSRF-safe server actions, presigned uploads content-type restricted,
  10 MB image / 200 MB video caps.
