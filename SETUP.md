# SETUP — human steps (Claude Code can't do these)

Roughly 2–3 hours total, mostly waiting on account creation. Part A is
required before Phase 1; Part B before Phase 3; Part C before Phase 4.

## Part A — before Phase 1 (≈45 min)

1. **Claude Code** — needs a paid Claude plan (Pro/Max) or an API key; the
   free claude.ai plan doesn't include it. Native installer (no Node
   needed), from code.claude.com/docs/en/setup, or use the Desktop app's
   Code tab. Run `claude` once in an empty `agency-os/` folder containing
   these kit files, log in via browser, and you're live.
2. **GitHub** — create a private repo `agency-os`, push the kit files.
3. **Supabase** — create a free project (region: eu-central / Frankfurt).
   Save: project URL, anon key, service_role key, DB password. Install
   Supabase CLI locally; `supabase login` + `supabase link`.
4. **Google AI Studio** — aistudio.google.com → create **two** Google Cloud
   projects (limits are per project): `agency-draft` → GEMINI_KEY_A,
   `agency-translate` → GEMINI_KEY_B. **Do not enable billing** on either —
   enabling billing removes the free tier on that project.
5. **Groq** — console.groq.com free account → GROQ_API_KEY.
6. **OpenRouter** — openrouter.ai free account → OPENROUTER_API_KEY; pick a
   current `:free` model and put its id in the env.
7. (Optional) **DeepL API Free** → DEEPL_API_KEY (500k chars/month).
8. Copy `.env.example` → `.env.local` (app) and `worker/.env` — fill what
   you have; leave Part B/C values empty for now.

## Part B — before Phase 3 (≈45 min)

9. **Cloudflare R2** — free Cloudflare account → R2 → create bucket
   `agency-media` (EU). Create an API token (Object Read & Write). Save
   account id, access key id, secret. Enable public access **via a custom
   domain or r2.dev** for the bucket (published media must be fetchable by
   Postiz/platforms); keep raw uploads under a `private/` prefix and only
   variants under `public/`.
10. **Telegram bot** — @BotFather → /newbot → name it (e.g. AgencyOS Bot)
    → TELEGRAM_BOT_TOKEN. Add every team member's account later via the
    /link flow inside the app.

## Part C — before Phase 4 (≈60–90 min, the fiddly part)

11. **Oracle Cloud Always Free** — sign up (card = verification only).
    Home region: Frankfurt or Amsterdam (no Turkey region; both are fine
    from Ankara). Create an Ampere A1 instance at the current free cap
    (2 OCPU / 12 GB), Ubuntu 24.04 aarch64, 150–200 GB boot volume, public
    IPv4. If "out of capacity": retry other availability domains, off-peak
    hours, or upgrade the account to Pay-As-You-Go (stays $0 within free
    limits — set a $1 budget alert immediately).
12. **Coolify** on the box (their one-line installer) → connect the GitHub
    repo → two apps: `web` (Next.js) and `worker` (Dockerfile), plus
    Postiz from its docker-compose. Point a free DuckDNS subdomain or a
    ~$10/yr domain at the box; Coolify handles TLS.
13. **Box packages** (worker Dockerfile should install these; verify ARM):
    ffmpeg, python3 + `pip install rembg faster-whisper`, fonts
    (fonts-noto-core covers Turkish glyphs for subtitles).
14. **Postiz** — open its UI, create the agency workspace, connect each
    client's Instagram/Facebook/TikTok. This is the tedious one: Postiz
    self-hosted requires creating your own developer app per platform
    (Meta developer app + Instagram/Facebook login products, TikTok
    developer app…) — follow Postiz's provider docs, budget an afternoon,
    and note Meta app review can take days. Until it clears, the app's
    "Yayınla" can simply notify whoever posts manually — the pipeline
    still saves the time either way. Save POSTIZ_URL + API key; map
    integrations to clients in the app's settings page.
15. **Backups** — confirm the nightly pg_dump→R2 cron from Phase 4 ran once;
    test a restore into a scratch Supabase project before trusting it.

## Sanity checklist before inviting the team

- [ ] Two test users; live feed updates across two browsers
- [ ] Caption/translate/reply buttons work with KEY_A removed (fallback)
- [ ] Phone → Telegram bot → asset with variants
- [ ] /approve/[token] works on a phone, expired token 404s
- [ ] Test reel renders with readable Turkish characters (ş ğ ı İ ç ö ü)
- [ ] Scheduled test card publishes to a **test** account, not a client's
- [ ] Budget alerts: Oracle $1, Cloudflare notifications on, Google
      projects show "Free" tier
- [ ] `.env*` files are in .gitignore and never committed
