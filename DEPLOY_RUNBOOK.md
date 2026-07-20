# DEPLOY_RUNBOOK — from "code green, worker dark" to fully live

_Authored by Session 2 (AgencyOS audit), 2026-07-19, from the **verified** live
state — not from the spec. Read this instead of re-deriving from SETUP.md +
DEPLOY.md; those remain the reference, this is the ordered execution path with
a real success check after each stage._

## Verified starting state (as of 2026-07-19)

- **Web app**: builds (`pnpm build` exit 0), typechecks (web + worker exit 0),
  **230 tests pass**. Next 16.2.10 / React 19. Nothing to fix in code.
- **Supabase**: LIVE — project `agency-os`, ref `kzlelmnqjbjtxnqgctjo`,
  region eu-central-1 (Frankfurt), `ACTIVE_HEALTHY`. **31 tables, RLS on all,
  10 migrations applied through `0010_ops_expansion`.** → **Do NOT re-run
  migrations. The schema is already current.** Just `supabase link`.
- **Worker (async half)**: code complete + typechecks, but **has never run** —
  `activity_log` has zero `worker.heartbeat` rows. This is the whole gap.
- **R2 / Telegram / Postiz / cron**: dormant because the worker isn't up.
- `.env.local` in the repo is **placeholders only** — real keys live nowhere
  on this machine yet. You paste them below.

**Success for this runbook = a `worker.heartbeat` row appears in `activity_log`
every 5 minutes, and the sanity checklist at the bottom is green.**

---

## Stage 0 — get the keys you already own into place (~10 min)

The single highest-leverage unblock. Nothing server-side works without the
service-role key.

1. Supabase dashboard → Project `agency-os` → Settings → API. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` **(secret — server + worker only)**
2. `cp .env.example .env.local` and fill those three + `APP_URL`.
   Duplicate the same values into `worker/.env` (create it).
3. Smoke test locally against the live DB:
   ```bash
   pnpm dev            # open http://localhost:3000/login
   ```
   Log in with the seeded admin (or run `pnpm seed:admin -- --email you@… --password … --name …`).
   You should see the board with the 1 existing client/card. **If this works,
   the entire web half is live-ready** — the rest is the async worker.

> `.env.local` and `worker/.env` are gitignored — confirm with `git status`
> that neither shows up before committing anything.

---

## Stage 1 — AI keys (free tier) (~30 min, mostly account creation)

Per SETUP.md Part A. **Do NOT enable billing on the Google projects — that
removes the free tier.**

- Google AI Studio → **two** Cloud projects: `agency-draft` → `GEMINI_KEY_A`,
  `agency-translate` → `GEMINI_KEY_B` (two projects = double the free rate limit).
- Groq (`GROQ_API_KEY`) + OpenRouter (`OPENROUTER_API_KEY`, pick a current
  `:free` model id) as the fallback chain.
- Leave `GEMINI_MODEL=gemini-flash-latest` / `GEMINI_MODEL_LITE=gemini-flash-lite-latest`.

Put all of these in `worker/.env` (the worker runs the AI queue) **and** the
app `.env.local` (some AI actions are server routes). Fallback is real: the
worker walks Gemini A → Gemini B → Groq → OpenRouter, so a missing/late key
degrades instead of failing.

---

## Stage 2 — R2 + Telegram (~30 min)

- **Cloudflare R2**: create bucket `agency-media` (EU) + an API token (Object
  Read & Write). Fill `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=agency-media`. Enable public access via
  r2.dev or a custom domain → set both `R2_PUBLIC_BASE_URL` **and**
  `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` to that URL (the browser needs it for
  `/assets` thumbnails). Raw uploads live under `private/`, variants under
  `public/`.
- **Telegram**: `@BotFather` → `/newbot` → `TELEGRAM_BOT_TOKEN`. Team members
  link themselves later via `/settings → Kod oluştur` → DM the bot `/link <code>`.

---

## Stage 3 — stand up the worker on Oracle + Coolify (the fiddly afternoon)

This is the step that flips everything from dormant to live.

1. **Oracle Cloud Always Free** → Ampere A1 instance (2 OCPU / 12 GB),
   Ubuntu 24.04 **aarch64**, ~150 GB boot, public IPv4. Home region Frankfurt
   or Amsterdam. If "out of capacity": retry other availability domains /
   off-peak, or flip to Pay-As-You-Go (stays $0 within free limits — **set a
   $1 budget alert immediately**).
2. **Coolify** one-line installer on the box → connect the GitHub repo
   (`TJVFIT/agency-os`).
3. **web app**: Dockerfile `./Dockerfile`, port 3000, set the full env,
   health check `GET /api/health`. Point a DuckDNS subdomain (or cheap domain)
   at the box; Coolify issues TLS. Set `APP_URL` to that public https URL
   (it's baked into approval links).
4. **worker app**: Dockerfile `./worker/Dockerfile`, **no exposed port**,
   full env, one replica. The image is self-contained and ARM-ready — it
   installs ffmpeg + Noto fonts + a Python venv with `rembg` + `whisperx`
   (CPU torch wheels, no CUDA). **First transcription pulls ~1 GB of models** —
   benchmark one 30–60s reel before inviting the team.
5. Leave `WHISPER_MODEL=small`, `TRANSCRIBE_ENGINE=whisperx`,
   `WHISPER_LANGUAGE=tr`, `TZ=Europe/Istanbul`, `LOG_LEVEL=info`.

### ✅ Stage-3 success check (this is the whole point of the runbook)

Within ~5 minutes of the worker booting, run this against the live DB
(Supabase SQL editor, or ask a session with Supabase MCP):

```sql
select action, created_at
from activity_log
where action = 'worker.heartbeat'
order by created_at desc
limit 3;
```

**Rows here = the worker is alive.** The dashboard also surfaces liveness from
this same signal. No rows after 10 min → check Coolify worker logs; the worker
logs a disable line per subsystem whose config is missing (it won't crash).

---

## Stage 4 — Postiz publishing (start the Meta review FIRST — it takes days)

⚠️ **This is the long pole and it gates Session 5's live auto-publishing.**

1. Deploy **Postiz** from its own docker-compose on the same box. Set
   `POSTIZ_URL` (e.g. `http://postiz:5000` inside the Coolify network) +
   `POSTIZ_API_KEY`.
2. Create your own **Meta developer app** (Instagram/Facebook login products)
   and **TikTok developer app**, connect each client's accounts in Postiz.
   **Meta app review can take days — submit on day one.**
3. TikTok draft-vs-direct is a per-integration Postiz setting, not our payload.
4. **Until Postiz is live, the app already degrades gracefully**: "Yayınla"
   fires a *"post manually"* notification and still records the scheduled slot.
   → **Session 5 should build against this manual-post/scheduling path** and
   treat live auto-publishing as a later milestone once review clears.

---

## Stage 5 — v2 extras + backups (optional, after go-live)

- **Web push**: `npx web-push generate-vapid-keys` once →
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` on web + worker, `VAPID_PRIVATE_KEY` +
  `VAPID_SUBJECT` on worker only. Without them the push UI hides itself and the
  worker sends Telegram-only.
- **Backups**: schedule `tsx scripts/backup.ts` nightly (needs `SUPABASE_DB_URL`
  + R2). Test a restore into a scratch project before trusting it.

---

## Security follow-ups (from the live advisor scan — NOT blockers today)

- **Leaked-password protection is OFF** — one toggle in Supabase → Auth →
  Policies. Turn it on. (Changing an account/security setting, so do it
  yourself.)
- **7 permissive RLS policies** (`team_write`/`team_update` on `cards`,
  `assets`, `shoots`, `card_contents`, `client_messages` — `WITH CHECK (true)`).
  **Fine for the staff-only tool** (every authenticated user is trusted staff).
  **They become a cross-tenant leak the moment the mobile pivot makes
  clients/customers authenticated tenants** — fix them as part of the mobile
  RLS design, not before. Do not tighten them on the current live app blindly;
  the staff app relies on them for writes.
- `telegram_link_codes` RLS-enabled-no-policy is **intentional** (service-role
  only). `my_role()` SECURITY DEFINER is low-risk.

---

## Sanity checklist before inviting the team

- [ ] Two test users; live feed updates across two browsers (Realtime)
- [ ] Caption/translate/reply work with `GEMINI_KEY_A` removed (fallback chain)
- [ ] Phone → Telegram bot → asset with 4 variants
- [ ] `/approve/[token]` works on a phone; expired token shows clean 404
- [ ] Test reel renders with readable Turkish glyphs (ş ğ ı İ ç ö ü)
- [ ] Scheduled test card publishes to a **test** account (or manual-post
      notification fires if Postiz isn't wired yet)
- [ ] Budget alerts: Oracle $1, Cloudflare notifications on, Google projects
      show "Free" tier
- [ ] `worker.heartbeat` visible in `activity_log` (Stage-3 check)
- [ ] `.env*` never committed
