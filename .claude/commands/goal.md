---
description: Agency OS v3 — client-driven automation upgrade, design overhaul, packaging
---

# GOAL: Agency OS v3 — full automation loop + design overhaul + packaging

You are continuing work on Agency OS. Read `CLAUDE.md`, `SPEC.md`, and
`BUILD_PHASES.md` fully before touching anything — they remain authoritative.
This command defines the **next major version** of the product, driven by a
real client requirements document (translated below). Where this command
conflicts with CLAUDE.md's hard rules, CLAUDE.md wins — flag the conflict to
the user instead of silently resolving it, per existing project convention.

This is a large, multi-session goal. Work through it **phase by phase**,
exactly like `BUILD_PHASES.md`: don't start a phase until the previous one's
acceptance checklist passes, run typecheck/lint/tests after each phase, and
summarize what was built/skipped/decided. If invoked via `/loop`, treat each
wake-up as "pick up at the next incomplete phase," not "start over."

---

## 0. Source requirements (client message, translated + kept verbatim intent)

Client-facing requirements (numbered as received, items 22–40):

22. Client approval and revision system must work.
23. Instagram accounts must be connectable.
24. Instagram content must be able to publish automatically.
25. TikTok accounts must be connectable.
26. TikTok content must be sendable either directly or as a draft.
27. Publish failures must be tracked.
28. Failed publishes must be retryable.
29. An automatic eligibility/compliance check must run before publishing.
30. Daily and weekly task plans must be prepared automatically.
31. Missing/incomplete work must be automatically detected.
32. Ad management must be active in v1.
33. Package and quota tracking must be active in v1.
34. Payment and extra-work tracking must be active in v1.
35. Automated reporting must be active in v1.
36. The system must be installable on a phone as a PWA.
37. Push notifications must work.
38. All manual and automatic operations must be logged.
39. The system must support suggestion, semi-automatic, and fully-automatic
    modes.
40. The agency manager must be able to turn automation off at any time and
    switch to fully manual control.

**Section 24 — the system's end-to-end logic** (this is the target automated
pipeline; every step must remain human-interruptible):

1. Client submits an idea.
2. AI simplifies the idea.
3. AI prepares a scenario and brief.
4. System determines whether a shoot is required.
5. Client reports availability.
6. System suggests appropriate crew, equipment, and route.
7. Agency calls the client and gets confirmation.
8. Shoot is added to the calendar.
9. Staff and vehicle are assigned.
10. Brief is sent before the shoot.
11. When the shoot is done, edit/copy/QC tasks open automatically.
12. Content goes to agency review.
13. After agency approval, it's sent to the client.
14. When the client approves, it's added to the publish schedule.
15. It publishes automatically on Instagram and TikTok.
16. Publish result is verified.
17. If ads are warranted, an ad task is created.
18. It's added to the end-of-month report.

The agency employee may intervene and change any step at any point.

**Section 25 — product definition** (framing, not new requirements): the
system should scale itself to staff count, increase route capacity with
vehicle count, redistribute workload on hiring/leave, default to 3h30m
travel+shoot blocks, and fully recompute the plan on client-side changes.
Its purpose is to minimize time agency staff spend on tracking, reminding,
task creation, scheduling, routing, and publishing — so they only handle work
that genuinely requires a human decision.

---

## 1. How these requirements map onto the existing system

Go read the current schema (`supabase/migrations/`), `lib/status.ts`, and the
worker (`worker/`) before planning — most of the scaffolding for this already
exists (cards, statuses, `activity_log`, `ai_jobs`, Postiz publishing,
Telegram bot). This is an **upgrade**, not a rewrite. Specifically:

- **Client approval/revision (22)** — extend the card status machine
  (`lib/status.ts`) with explicit `client_review` / `client_revision_requested`
  / `client_approved` states if not already present. Client-facing approval
  already exists per SPEC (signed-token public route) — verify it covers
  revision requests with comments, not just approve/reject.
- **Instagram/TikTok connect + auto-publish (23–26)** — route through Postiz
  first (already the stack's publishing layer) since it already handles
  OAuth connect flows for both platforms. Verify Postiz's TikTok integration
  actually supports **draft/inbox** posting vs. direct publish — TikTok's
  Content Posting API gates unaudited apps to "private/draft only until
  reviewed" by default; if Postiz doesn't expose that distinction cleanly,
  flag it rather than fake a "draft" state that doesn't reflect real TikTok
  behavior.
- **Failure tracking + retry (27–28)** — extend the publish dispatcher
  (worker) with the same `attempts`/`run_after`/backoff pattern already used
  for AI jobs (CLAUDE.md conventions section). Surface failed publishes in
  the live activity feed and via Telegram alert to admins.
- **Pre-publish eligibility check (29)** — a deterministic + AI-assisted
  check before a card can move to "scheduled": required fields present
  (caption, media, hashtags within client's banned-word/glossary rules),
  aspect ratio/duration constraints per platform, client approval actually
  recorded. Block the transition in `lib/status.ts`, don't just warn.
- **Auto daily/weekly task plans + missing-work detection (30–31)** — a
  worker cron job that, per client, checks posting cadence commitments
  (add a `posting_cadence` field to `clients` if it doesn't exist) against
  actual scheduled/published cards, and opens/flags cards for gaps. This is
  the "system suggests" layer — it creates cards/tasks, it does not publish
  anything itself.
- **Ad management (32)** — new `ad_campaigns` / `ad_tasks` tables, linked to
  cards/clients. v1 scope should be **tracking and task management** for ads
  (budget, platform, status, linked creative), not necessarily full API-driven
  campaign creation — flag to the user whether they want live Meta/TikTok Ads
  API integration now (requires business verification + app review on both
  platforms, non-trivial lead time) or a v1 that tracks ad work as structured
  tasks with manual execution.
- **Package/quota tracking (33)** — `client_packages` table: package tier,
  included posts/reels/stories per period, renewal date, consumption counters
  driven by published `cards`. Surface remaining quota in the client's
  dashboard/report.
- **Payment/extra-work tracking (34)** — `invoices` / `extra_work_items`
  table: out-of-package work items, agreed price, status
  (`pending|invoiced|paid`). This is bookkeeping, not payment processing —
  do **not** wire a payment processor here without asking first per
  CLAUDE.md's paid-dependency rule.
- **Automated reporting (35)** — monthly report generator (worker cron):
  posts published, engagement pulled from platform APIs where available,
  package consumption, ad task summary, outstanding invoices. Render to
  PDF/HTML, deliver via Telegram + in-app.
- **PWA + push (36–37)** — `next-pwa` (or App Router-native manifest +
  service worker) for installability; Web Push (VAPID keys, free) for
  notifications — this can fully replace or complement the existing Telegram
  channel; ask the user which they want as primary.
- **Full logging (38)** — already largely covered by `activity_log` +
  triggers per CLAUDE.md rule 2; audit for gaps once the above tables exist
  (ad tasks, invoices, packages need trigger coverage too).
- **Automation modes + kill switch (39–40)** — a single `automation_mode`
  setting (`suggest|semi_auto|full_auto`) at the workspace level (and
  optionally per-client override). In `suggest`, the system only creates
  draft tasks/suggestions for a human to act on. In `semi_auto`, it executes
  reversible steps (task creation, scheduling suggestions) but still gates
  publish/ads on human approval. In `full_auto`, it runs the full 18-step
  loop above unattended except where a hard gate exists (client approval,
  agency approval — those never auto-skip). A visible, one-click "manuel
  moda geç" (switch to manual) control for the agency manager must always be
  reachable from the dashboard and must take effect immediately (stop the
  worker's automatic transitions, not just hide the UI toggle).

---

## 2. Design overhaul — use Magic MCP heavily

The user wants the UI genuinely transformed, not incrementally patched, using
**21st-dev/magic-mcp** (AI-driven component generation) as the primary design
tool for this pass.

**Setup (needs the user, cannot be done unattended):**
1. User creates an account and API key at https://21st.dev/magic/console
   (free beta as of writing — confirm current pricing before assuming $0).
2. Register the MCP server for this Claude Code environment:
   `npx @21st-dev/cli@latest install claude --api-key <key>`
   (or manually add it to the MCP config per the repo's README).
3. Once connected, its tools will appear via `ToolSearch` — search for
   "magic" or "21st" before first use, per this environment's deferred-tool
   convention.

**How to use it during this phase:** for every major surface being touched
(dashboard, board, client review page, reports, PWA install prompt, manual/
help tab) generate the component through Magic MCP first, then adapt it into
this codebase's existing patterns (Tailwind tokens, `components/ui/*` kit
per the UI-kit memory, `lib/i18n/tr.ts` strings) — don't let generated
components introduce a second design language. Cross-check against the
`ui-ux-pro-max` and `high-end-visual-design` skills already available in this
environment for consistency rules while integrating Magic's output.

---

## 3. Manual / help tab

Add a "Kullanım Kılavuzu" (manual) tab reachable from the main nav, scoped
per role (agency staff vs. client-facing approval page gets its own short
version). Keep it genuinely short — a skimmable one-pager per audience, not
documentation:
- What each pipeline stage means and what action is expected of them.
- How to approve/request revisions.
- How to read the report/quota view.
- Where to find notifications and how to turn them on (PWA install + push
  permission).
No walls of text, no exhaustive feature list — a client should be able to
read their version in under 2 minutes. Write it directly into
`lib/i18n/tr.ts` alongside the rest of the UI strings.

---

## 4. Dev-tooling augmentation (build-time only, not shipped product features)

These two repos are Claude Code accelerants, not application code — do not
merge their source into the Next.js app or worker.

- **msitarzewski/agency-agents** — pull a curated subset relevant to this
  project (social media / content / project-management focused personas)
  into `.claude/agents/` as project-scoped subagents, so future Claude Code
  sessions on this repo can delegate to them. Don't dump all 230+; pick ~10
  that map to real recurring tasks here (content strategy, copywriting/
  caption QA, social platform specialists, reporting).
- **kostja94/marketing-skills** — before installing, diff against the skills
  already present in this environment (several — `social-content`,
  `ad-creative`, `paid-ads`, `content-strategy`, etc. — appear to already
  cover this library's ground). Only add skills that are genuinely missing,
  via `npx skills add kostja94/marketing-skills` scoped to specific skill
  files if the tool supports partial install, to avoid duplicate/conflicting
  skill definitions.
- **anil-matcha/open-generative-ai** — do **not** install. Flagged above:
  wrong shape (separate unrestricted media-gen product, Electron + local
  GPU inference) for this codebase and this budget. If the user still wants
  a creative/media studio tab, build a scoped one against the existing
  Gemini/free-tier AI router (`lib/ai/router.ts`) instead of importing this
  repo — ask first.

---

## 5. Packaging deliverables

Two deliverables requested for the end of this work:

1. **Zip of the repo** — a clean, buildable snapshot (exclude
   `node_modules`, `.next`, `.env*`, any secrets) the user can hand off or
   archive.
2. **Desktop app** — wrap the deployed web app (not a from-scratch native
   rewrite) using **Tauri** (Rust-based, near-zero binary size, free, far
   lighter than Electron — better fit for the $0-infra ethos even though
   packaging itself is a one-time local build cost, not a hosting cost) or
   Electron if the user specifically wants parity with the
   open-generative-ai repo's approach. Point it at the production URL with a
   thin native shell (menu bar, auto-update optional, notification bridge
   if useful). Ask the user which they prefer before scaffolding — this is
   an architecture choice worth a one-line confirmation, not a silent
   default.

---

## 6. Execution order for this goal

1. Read current schema/status machine/worker — produce a gap list against
   items 22–40 before writing any code.
2. New migrations: `ad_campaigns`/`ad_tasks`, `client_packages`,
   `invoices`/`extra_work_items`, `automation_mode` setting, any status-machine
   additions for client revision flow. Show the diff before `supabase db push`
   per CLAUDE.md.
3. Worker: publish failure/retry, eligibility check, daily/weekly planner
   cron, missing-work detector, monthly report generator.
4. PWA manifest + service worker + Web Push.
5. Automation mode setting + kill switch UI, wired so the worker actually
   respects it (not just a UI flag).
6. Design pass via Magic MCP across touched surfaces.
7. Manual/help tab.
8. Dev-tooling: curate `.claude/agents/` subset, dedupe marketing-skills.
9. Packaging: zip + desktop shell (after user confirms Tauri vs. Electron).

After each numbered step: typecheck + lint + tests green, summarize what
shipped, what's deferred, and any new paid-dependency or ToS-risk flags
(ad platform API review timelines, TikTok draft-mode reality, Magic MCP
pricing) surfaced along the way — per CLAUDE.md, don't silently absorb a
paid dependency or a scope change.
