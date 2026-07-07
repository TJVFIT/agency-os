# Agency OS — Project Instructions for Claude Code

Internal operations app for a social media agency (6–10 users, ~10–40 clients:
restaurants, cafes, local businesses in Ankara). One shared workspace: content
pipeline board, calendar, live activity feed, AI-assisted captions / replies /
translation, media pipeline, publishing, Telegram bot.

**Total infra budget: $0/month.** Every architectural decision must respect the
free tiers documented in SPEC.md §2. Never introduce a paid dependency without
flagging it explicitly and asking first.

## Stack (fixed — do not substitute)

- **Next.js 15+ (App Router, TypeScript, Tailwind CSS)** — the web app
- **Supabase (free tier)** — Postgres, Auth, Realtime, RLS. Schema lives in
  `supabase/migrations/` (starting point: `schema.sql` in repo root)
- **Cloudflare R2 (free tier)** — all media. Never store media in Supabase
  Storage or the repo. Access via S3-compatible SDK + presigned URLs
- **Worker process** (`worker/`) — long-running Node process (pm2) on the
  Oracle box: AI job queue, media jobs (sharp / rembg / FFmpeg / faster-whisper),
  Telegram bot (grammY), cron jobs (node-cron), publish dispatcher
- **Postiz (self-hosted)** — publishing. Called via REST from the worker only
- **AI providers** — Gemini Flash / Flash-Lite (free tier) primary,
  Groq free tier and OpenRouter free models as fallbacks. DeepL Free optional
  second translation engine. ALL model calls go through `lib/ai/router.ts` —
  never call a provider SDK directly from a page, action, or component

## Hard rules (non-negotiable)

1. **Nothing publishes without `approved` status.** The publish dispatcher must
   verify status server-side, never trust client input.
2. **Every mutation writes to `activity_log`.** Prefer DB triggers; where a
   trigger can't capture actor context, log from the server action.
3. **All AI calls are queued** (`ai_jobs` table, worker drains it). Free-tier
   Gemini allows ~10–15 requests/min — the worker enforces a token bucket per
   provider and falls through the provider chain on 429/5xx. UI never blocks on
   an AI call: enqueue → show "işleniyor" state → Realtime updates the result.
4. **Secrets server-side only.** Supabase service key, R2 keys, AI keys,
   Telegram token, Postiz key: worker + server actions only. Client gets only
   `NEXT_PUBLIC_SUPABASE_URL` and the anon key.
5. **RLS on every table.** Internal-team policies per SPEC.md §4. The public
   approval page uses signed tokens through a server route with the service
   role — no anon table access.
6. **No outbound engagement automation.** No auto-likes, auto-follows, mass
   DMs, scraping. Posting to the clients' own connected accounts via Postiz and
   replying to inbound messages (human-approved) only. This is a ToS red line.
7. **UI language: Turkish** (simple `tr.ts` strings module, structured so an
   `en.ts` can be added later). Code, comments, commits: English.
8. **Prompts live in `lib/ai/prompts.ts`** exactly as specified in SPEC.md §6.
   All LLM outputs are JSON — validate with zod, retry once on parse failure.

## Conventions

- Server Actions for mutations; API route handlers only for webhooks
  (Telegram), uploads (presign), and the public approval endpoints
- `lib/db/` typed query helpers; generate Supabase types
  (`supabase gen types typescript`) into `lib/db/types.ts`
- Components: `components/` shared, route-private components live next to
  their route. Keep components small; extract logic to `lib/`
- Dates: store UTC, display Europe/Istanbul. Use `date-fns` + `date-fns-tz`
- Errors: worker jobs get `attempts`, exponential backoff via `run_after`,
  max 5 attempts, then status `error` + Telegram alert to admins
- Tests: Vitest for `lib/` logic (status machine, ai router fallback, ASS
  subtitle generator). Don't chase UI coverage
- Commits: conventional commits, one feature per commit

## Workflow for you (Claude Code)

- Follow `BUILD_PHASES.md` in order. Complete a phase's acceptance checklist
  before starting the next. Ask before deviating from SPEC.md
- Read SPEC.md fully before Phase 1. When SPEC and this file conflict,
  SPEC wins; flag the conflict
- After each phase: run typecheck + lint + tests, then summarize what was
  built, what was skipped, and any decisions made
- Never run destructive DB commands against a linked remote project without
  confirmation. Prefer `supabase db push` with reviewed migrations
