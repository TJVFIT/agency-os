# CLIENT_READINESS — punch list to "client-ready"

_Last updated: 2026-07-13_

The product is **built and the backend is live.** v1 spec + the client's 40-item
upgrade doc are code-complete, 140 tests pass, and Supabase is LIVE (Frankfurt,
ref `kzlelmnqjbjtxnqgctjo`) with the core loop (login → board → card moves →
`activity_log`) and RLS verified against real auth on 2026-07-11. Everything
below is **infrastructure wiring, one design pass, and verification of the async
half — not new features.**

**Three tiers of "ready":**
- **Demo-ready** (credential-free `/preview`) — ✅ done today.
- **Internal go-live** (real team uses it end-to-end) — **Section 1**.
- **Auto-publish to client accounts** — **Section 2** (calendar-bound, start now).

---

## Section 1 — Critical path to internal go-live (do in this order)

- [ ] **Paste `SUPABASE_SERVICE_ROLE_KEY`** into `.env.local` (app) and
      `worker/.env`, from Supabase dashboard → Project → API settings.
      _Why: THE highest-leverage unblock. Without it every server-side write
      fails — activity logging, approvals, portal, settings, push, production,
      finance, automation. (SETUP.md step 3 / step 8)_
- [ ] **AI provider keys** — two Gemini projects (`agency-draft` → `GEMINI_KEY_A`,
      `agency-translate` → `GEMINI_KEY_B`; **do NOT enable billing** — it removes
      the free tier), plus `GROQ_API_KEY` and `OPENROUTER_API_KEY` (pick a current
      `:free` model id). _Why: no captions / replies / translation / posters /
      scenario until these exist. Free tier. (SETUP.md steps 4–6)_
- [ ] **Stand up the worker on a box** — Oracle Cloud Always-Free Ampere A1
      (2 OCPU / 12 GB, Ubuntu 24.04 aarch64) + Coolify; deploy the `worker`
      app from `worker/Dockerfile` (bundles ffmpeg + rembg + faster-whisper +
      Noto fonts). _Why: the entire async half is dormant until this runs — AI
      job queue, media pipeline (image variants, reels), Telegram bot, publish
      dispatcher, cron, notifications. The fiddly afternoon. (SETUP.md Part C
      steps 11–13; DEPLOY.md step 4)_
- [ ] **Cloudflare R2 bucket** — create `agency-media` (EU), API token
      (Object Read & Write), enable public access via r2.dev/custom domain;
      raw uploads under `private/`, variants under `public/`. _Why: all media
      lives here — no uploads, variants, or reels without it. (SETUP.md Part B
      step 9)_
- [ ] **Telegram bot token** — @BotFather → `/newbot` → `TELEGRAM_BOT_TOKEN`.
      _Why: phone→asset intake, inline approvals, and admin alerts run through
      the bot. (SETUP.md Part B step 10)_

---

## Section 2 — Publishing to real client accounts (start early — calendar-bound)

- [ ] **Postiz self-hosted + per-platform developer apps + Meta app review.**
      Deploy Postiz (its docker-compose), create the agency workspace, connect
      each client's Instagram / Facebook / TikTok. Requires your own Meta
      developer app (Instagram/Facebook login products) and TikTok developer
      app; save `POSTIZ_URL` + API key and map integrations to clients in the
      settings page. _Why: **Meta app review can take DAYS — start day one.**
      Until it clears, the app degrades gracefully: "Yayınla" fires a
      "post manually" notification and the pipeline still saves the time.
      (SETUP.md Part C step 14)_

---

## Section 3 — Verify the async half against live services

_All blocked on Section 1 item 3 (worker running). Only static-checked so far.
Walkthrough: MANUAL_TEST.md._

- [ ] **Realtime across two browsers** — User A drags a card; User B sees the
      column + feed update within ~1s, no refresh. _(MANUAL_TEST §Phase 1, step 3)_
- [ ] **AI queue end-to-end** — "3 başlık üret" → "işleniyor" → 3 Turkish
      variants via Realtime; unset `GEMINI_KEY_A` and confirm fallback chain
      still returns; "Çevir" fills EN and keeps glossary `keep` terms.
      _(MANUAL_TEST §Phase 2, steps 5–7)_
- [ ] **Media / reels pipeline** — image upload shows 4 variants within a
      minute (sharp/rembg); a reel renders 1080×1920 with readable Turkish
      glyphs `ş ğ ı İ ç ö ü` (ffmpeg/whisper). _(MANUAL_TEST §Phase 3 step 9,
      §Phase 4 step 12)_
- [ ] **Postiz payload / publish dispatcher** — schedule a card 2 min out to a
      **test** account → publishes via Postiz (or notifies for manual posting
      if Postiz isn't wired) → status flips to "Yayınlandı" with a feed entry;
      compliance gate blocks a banned word. _(MANUAL_TEST §Phase 4 step 13,
      §v2 step 19)_
- [ ] **Telegram flows** — `/settings` → "Kod oluştur" → DM bot `/link <code>`
      → linked; send a photo → pick client → lands in `/assets` with variants.
      _(MANUAL_TEST §Phase 3 step 11)_
- [ ] **Approval + portal on a phone** — `/approve/{token}` approve/reject with
      comment; expired/garbage token shows the clean "süresi dolmuş" page;
      portal three tabs (approve / idea → AI refine / müsaitlik) + revoke.
      _(MANUAL_TEST §Phase 3 step 10, §v2 steps 15–16)_
- [ ] **Production / finance / automation modes** — "Zaman öner" honors
      müsaitlik; finance quota bars + overdue detector; master automation set
      to "Öneri" writes suggestions instead of auto-executing. _(MANUAL_TEST
      §v2 steps 17–20)_
- [ ] **PWA + push + daily plan** — install app, "Bildirimleri aç", trigger a
      notification with the tab closed (needs VAPID keys — DEPLOY.md step 7);
      08:00 cron sends each staffer their digest. _(MANUAL_TEST §v2 steps 21–22)_

---

## Section 4 — Product & housekeeping

- [ ] **Merge the 16 stranded commits** on branch
      `claude/agency-os-ios-planning-85e9c5` into `main`. _Why: `main` is BEHIND
      this work — deploying from `main` as-is ships WITHOUT the security/reliability
      audit fixes (publish-integrity, `activity_log` gaps, reports), the Tauri
      desktop shell, and feature completions (poster button, ad reminders, kota
      bars)._
- [ ] **Design overhaul to "Ethereal Glass"** across dashboard / board / finance
      / reports / manual / portal. _Why: consistent client-facing polish; in
      progress separately._
- [ ] **Deferred low-value audit findings** (do after go-live): M17 portal batch
      approve, M7 Postiz enumerate, L1 approve week-scoping, L6 dup suggestion.
      _Why: nice-to-have, not blockers._

---

## Section 5 — Pre-team-invite sanity checklist

_Reproduced from SETUP.md — tick before inviting the team._

- [ ] Two test users; live feed updates across two browsers
- [ ] Caption / translate / reply buttons work with `KEY_A` removed (fallback)
- [ ] Phone → Telegram bot → asset with variants
- [ ] `/approve/[token]` works on a phone, expired token 404s
- [ ] Test reel renders with readable Turkish characters (ş ğ ı İ ç ö ü)
- [ ] Scheduled test card publishes to a **test** account, not a client's
- [ ] Budget alerts: Oracle $1, Cloudflare notifications on, Google projects
      show "Free" tier
- [ ] `.env*` files are in `.gitignore` and never committed
