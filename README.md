# AgencyOS

AgencyOS is an operations workspace for planning and coordinating social content work. It brings the team board, calendar, client collaboration, assets, production tasks, reporting, and publishing workflow into one web application.

The repository contains a Next.js web app and a TypeScript background worker. External services such as Supabase, object storage, AI providers, Telegram, and Postiz require owner-managed configuration; the presence of integration code does not mean an account is connected or publishing is live.

## Features in the codebase

- Kanban board and calendar for content work
- Client workspaces and a token-based portal for approvals, messages, uploads, and availability
- Asset management and background media tasks
- AI-assisted caption, translation, and editing workflows
- Production, finance, workload, and reporting views
- A credential-free preview area at `/preview` using demo data

## Technology

- Next.js 16, React 19, TypeScript, and pnpm
- Supabase/PostgreSQL for application data and authentication
- A Node.js/TypeScript worker for asynchronous work and integrations
- S3-compatible object storage, with Cloudflare R2 described in the setup guide
- FFmpeg-based media tooling, with WhisperX and rembg documented for the worker
- Vitest, ESLint, TypeScript checks, and Prettier configuration

## Run the preview locally

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000/preview> for the credential-free demo. The connected application needs service configuration; follow [SETUP.md](SETUP.md) before using routes that depend on Supabase, the worker, or external providers.

## Full setup and deployment

- [SETUP.md](SETUP.md) — local configuration and required service accounts
- [DEPLOY.md](DEPLOY.md) and [DEPLOY_RUNBOOK.md](DEPLOY_RUNBOOK.md) — deployment guidance
- [MANUAL_TEST.md](MANUAL_TEST.md) — end-to-end verification checklist
- [`.env.example`](.env.example) — configuration variable names and placeholders

Keep real credentials in local environment files or a secret manager. Do not commit `.env.local`, `worker/.env`, API keys, or client account credentials. Verify external integrations with test accounts before connecting client accounts.

## Useful checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These commands are available in the repository scripts; their current results depend on the environment and have not been asserted by this README.