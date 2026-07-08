# Deploy (Coolify on the Oracle box)

Reference for standing the stack up. Human prerequisites are in SETUP.md
(Parts A–C); this doc covers turning the repo into a running deployment.

## Topology

- **web** — Next.js (this repo root). Build with the root `Dockerfile`
  (standalone output) or Coolify Nixpacks. Needs `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`,
  and the R2 vars (for presigned uploads).
- **worker** — long-running Node process. Build with `worker/Dockerfile`
  (bundles ffmpeg + rembg + faster-whisper + Noto fonts). Runs the ai_jobs
  loop, media/reel pipeline, Telegram bot, publish dispatcher, cron, and the
  notification dispatcher. Needs the full env (SETUP.md Parts A–C).
- **Postiz** — its own docker-compose (SETUP.md Part C). Reachable from the
  worker at `POSTIZ_URL`.
- **Supabase** — cloud (free tier). Migrations in `supabase/migrations/`.

## Steps

1. **Database**: `supabase link` then `supabase db push` (review the diff).
   Migrations apply in order: `0001` schema, `0002` fail-closed status guard,
   `0003` queue claim fn + activity triggers, `0004` telegram link codes,
   `0005` assignment log.
2. **Seed admin**: `pnpm seed:admin -- --email … --password … --name …`.
3. **Coolify → web app**: point at the repo, Dockerfile = `./Dockerfile`,
   port 3000, set env. Health check: `GET /api/health`.
4. **Coolify → worker app**: Dockerfile = `./worker/Dockerfile`, no exposed
   port, set env, run under pm2/one replica. It logs a heartbeat every 5 min
   (`activity_log action='worker.heartbeat'`) — the dashboard shows liveness.
5. **Domain + TLS**: point a DuckDNS/custom domain at the box; Coolify issues
   TLS. Set `APP_URL` to the public https URL (used in approval links).
6. **Backups**: schedule `tsx scripts/backup.ts` nightly (needs
   `SUPABASE_DB_URL` + R2). Configure an R2 lifecycle rule to prune
   `backups/` older than 14 days and raw reel inputs under `private/`.

## Free-tier guards (CLAUDE.md budget = $0)

- Two Google projects (KEY_A drafting, KEY_B translate); no billing enabled.
- Worker keeps memory lean: whisper `small` int8, FFmpeg/reels concurrency 1
  (enforced by the sequential queue loop).
- No media in Postgres/repo — R2 only; `activity_log`/`ai_jobs` pruned by the
  nightly retention cron.

## Graceful degradation

Every subsystem checks its own config at boot and disables itself with a log
line instead of crashing: no AI keys → jobs error+retry; no R2 → media jobs
error; no Telegram token → bot + notifications off; no Postiz → publish falls
back to a "post manually" notification. The web app and worker boot with only
the Supabase core set.
