# Build Phases — how to drive Claude Code through this project

Run phases **in order**, one Claude Code session (or a few) per phase.
Start every session in the repo root so CLAUDE.md is auto-loaded.
Paste the prompt block, let it plan first (Plan Mode / "make a plan before
writing code"), review the plan, then let it build. Don't start a phase until
the previous phase's acceptance checklist fully passes.

Human-only prerequisites are in SETUP.md — do SETUP Part A before Phase 1.

---

## Phase 0 — Repo bootstrap (15 min)

**Prompt:**

```
Read CLAUDE.md and SPEC.md fully. Then:
1. Scaffold a Next.js 15 App Router + TypeScript + Tailwind project in this
   repo (pnpm), plus a `worker/` package (plain TS, tsx runtime) in a pnpm
   workspace.
2. Add Supabase CLI config (`supabase init`), move schema.sql into
   supabase/migrations/0001_init.sql unchanged.
3. Create lib/i18n/tr.ts skeleton, lib/status.ts with the transition
   function + Vitest tests per SPEC §5, .env.example already exists — wire
   env loading (zod-validated env module, separate app vs worker schemas).
4. ESLint + Prettier + Vitest configured; `pnpm typecheck`, `pnpm lint`,
   `pnpm test` all pass.
Do not build UI yet. Summarize the workspace layout when done.
```

**Accept when:** repo installs clean; tests for `lib/status.ts` cover every
transition (allowed + rejected + skip-translated logic); migration file is
byte-identical to schema.sql.

---

## Phase 1 — The jointed core: auth, clients, cards, board, live feed

**Prompt:**

```
Implement Phase 1 per SPEC.md sections 3, 4, 5, 12, 13:
- Supabase auth (email+password, no public signup; seed script creates the
  first admin), profiles page guard, role loading.
- Clients CRUD (/clients, /clients/[id]) incl. brand_profile editor
  (structured form, not raw JSON), glossary editor, hashtag bank.
- Cards: create dialog, /cards/[id] workroom with TR/EN content tabs,
  comments, assignee, status controls using lib/status.ts via server
  actions (DB trigger is the backstop).
- /board kanban grouped by status with client/assignee/type filters,
  drag between columns = status change.
- /dashboard: "my queue" (cards where I'm assignee or my role acts next)
  + live activity feed drawer subscribed to activity_log via Realtime;
  cards update in place on the board via Realtime.
- Turkish UI strings in lib/i18n/tr.ts.
Run `supabase db push` against the linked project only after showing me the
diff. Finish with typecheck/lint/tests green and a manual test script I can
follow.
```

**Accept when:** two browsers logged in as two users — user A drags a card,
user B sees column + feed update within ~1 s without refresh; a `member`
attempting to set `approved` is blocked (UI and DB); every action appears in
the feed in readable Turkish.

---

## Phase 2 — Calendar + AI (captions, translate, replies)

**Prompt:**

```
Implement Phase 2 per SPEC.md sections 6 and 12:
- /calendar month+week views (all clients + per-client), drag to reschedule
  (writes due_at, or scheduled_at when status is scheduled), schedule dialog
  (datetime Europe/Istanbul + platform checkboxes from the client's
  connected accounts).
- ai_jobs queue plumbing end-to-end: server action enqueues, worker/ poll
  loop claims with FOR UPDATE SKIP LOCKED, executes, writes result, activity
  log; UI buttons show pending state and resolve via Realtime.
- lib/ai/router.ts with the exact provider chain, per-provider token bucket
  (1 req/5s burst 3), zod schemas per prompt, one JSON-repair retry;
  lib/ai/prompts.ts verbatim from SPEC §6.3.
- Wire three card actions: "3 başlık üret" (caption variants → picker →
  writes card_contents tr), "Çevir" (tr↔en using glossary), "Yanıt taslağı"
  (paste incoming message → reply draft + escalate flag).
- Unit tests: router fallback (mock 429 on provider 1 → provider 2 used),
  token bucket timing, prompt schema validation.
```

**Accept when:** with only KEY_A set and a forced 429, captions still return
via fallback; a caption request from click → 3 Turkish variants lands in
under ~30 s; translation obeys a glossary entry ("Fıstıklı Latte" stays
untranslated when rule=keep); killing the worker mid-job leaves the job
`queued`/retryable, never lost.

---

## Phase 3 — Assets, image pipeline, magic-link approvals, Telegram bot

**Prompt:**

```
Implement Phase 3 per SPEC.md sections 7.1, 9, 10:
- R2 presigned upload flow (/api/assets/presign + /complete), /assets
  library with filters, attach-to-card picker showing variant sizes.
- Worker image jobs: sharp variants (square/portrait/story/thumb) +
  logo watermark; bg_remove via rembg CLI; both as ai_jobs kinds.
- Approval flow: "Onaya gönder" on calendar week → approval_links +
  WhatsApp-ready message; public /approve/[token] page per SPEC §10
  (mobile-first, TR/EN caption tabs, approve/reject+comment, bulk approve,
  rate-limited, noindex); decisions transition cards via service role and
  appear in the live feed.
- Telegram bot in worker (grammY, polling): /link flow from settings page,
  the notification matrix from SPEC §9, media intake with client inline
  keyboard → R2 → asset + variants job, manager inline Approve/Reject.
```

**Accept when:** phone photo sent to the bot appears in /assets with 4
variants inside a minute; a manager approves a card from Telegram and the
board updates live; an expired/garbage token on /approve returns a clean
404; rejected-with-comment moves the card to copy_draft and posts the
comment on the card.

---

## Phase 4 — Reels, publishing, crons

**Prompt:**

```
Implement Phase 4 per SPEC.md sections 7.2, 8, 11:
- render_reel job: ffprobe check → faster-whisper (small, int8, word
  timestamps; Groq Whisper fallback) → worker/lib/ass.ts karaoke subtitle
  generator (unit-tested: timing math, 2–3 word grouping, styling) →
  single-pass FFmpeg 1080×1920 burn-in + logo → optional EN second render
  via translated segments → assets attached to card. Concurrency 1,
  temp cleanup in finally.
- Postiz integration: settings page maps Postiz integrations to
  client_social_accounts; publish dispatcher cron per SPEC §8 with
  re-verification of approval, retries, Telegram alerts; success sets
  published + stores post ids.
- node-cron jobs: Monday planner, Friday reports (+ metrics entry form on
  client page), daily gap radar, nightly retention + backup script
  (pg_dump → R2).
- /reports pages and dashboard gap-radar flags.
```

**Accept when:** a 30 s vertical phone video becomes a captioned, logo'd,
1080×1920 reel attached to its card without manual editing; a card
scheduled 2 minutes out auto-publishes to a test Instagram account via
Postiz and flips to published with a feed entry; Monday planner creates 5
sensible Turkish idea cards for a seeded client; gap radar pings Telegram
for a client with an empty week.

---

## Phase 5 (optional polish, post-launch)

Evergreen recycling (SPEC §11), Postiz analytics → auto-filled report
metrics, per-platform caption overrides, PWA install prompt for the team,
worker health page graphs. Only after the team has used it for 2+ weeks —
let real complaints set this list.

---

## Session tips

- One phase per session where possible; `/compact` if context gets heavy.
- If Claude Code proposes deviating from SPEC.md, make it state the tradeoff
  in one paragraph and wait for your yes.
- Commit at every green checklist item; push to a private GitHub repo so the
  Oracle box can pull deploys via Coolify.
- When something breaks on the box but not locally: it's almost always ARM
  (get ARM builds of sharp/rembg/ffmpeg — all exist) or memory (whisper
  model size). Say exactly that to Claude Code.
