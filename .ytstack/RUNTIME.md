# Runtime

Services, APIs, env vars, ports, and deploy target for SunoFlow.

## Services (external dependencies)

| Service | Purpose | Env var(s) |
|---|---|---|
| [sunoapi.org](https://sunoapi.org) | AI music generation | `SUNOAPI_KEY` |
| OpenAI (`gpt-4o-mini`) | LLM-powered lyrics/prompt assistance | `OPENAI_API_KEY` |
| Google OAuth | Federated login | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Mailjet | Transactional email (falls back to console log) | (see `docs/mailjet-setup.md`) |
| Sentry / GlitchTip | Error + perf tracking. Replay disabled when DSN points at `errors.yester.cloud` | `NEXT_PUBLIC_SENTRY_DSN` + server DSN |
| PostHog | Product analytics (deferred via `requestIdleCallback`) | `NEXT_PUBLIC_POSTHOG_KEY`, host |
| PostgreSQL 16 | Primary data store | `SUNOFLOW_DATABASE_URL`, `DATABASE_URL` |

## Environment variables (minimum)

From `.env.example` — see README for the full reference:

- `SUNOFLOW_DATABASE_URL` — app DB URL
- `DATABASE_URL` — Prisma DB URL (same DB, different consumer)
- `AUTH_SECRET` — NextAuth session signing (`npx auth secret`)
- `AUTH_URL` — base URL (e.g. `http://localhost:3000`)
- `SUNOAPI_KEY` — Suno API access
- `OPENAI_API_KEY` — OpenAI
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — Google OAuth
- `AUDIO_CACHE_DIR`, `IMAGE_CACHE_DIR` — local caches (must be persistent volumes in prod)

## Ports

- `3000` — Next.js dev/prod server (default)
- `5432` — Postgres (via `docker compose up db`)

## Deploy target

**Production:** Railway, service `SunoFlow`, URL `https://sunoflow.up.railway.app`.

Trigger paths:
- Push tag `v*.*.*` to `main` → `.github/workflows/deploy-production.yml` → `railway up --service SunoFlow`
- Manual `workflow_dispatch` with optional SHA

Build constraint: `NEXT_PUBLIC_SENTRY_DSN` must be exposed as a Docker build ARG (commit `f9ce935`).

## Local dev commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Migrate + start dev server (Turbo) |
| `pnpm build` | Build for production |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | Next lint |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm mcp` | Run MCP server (`mcp/server.ts`) |
| `pnpm db:backup` / `db:restore` | DB ops (see backup-runbook) |
| `pnpm analyze` | Bundle analyzer |

## Operations references

- Deployment: [`docs/deployment-runbook.md`](../docs/deployment-runbook.md)
- Backup/restore: [`docs/backup-runbook.md`](../docs/backup-runbook.md)
- Secret rotation: [`docs/secrets-rotation-runbook.md`](../docs/secrets-rotation-runbook.md)
- Incident response: [`docs/incident-response.md`](../docs/incident-response.md)
- Uptime monitoring: [`docs/uptime-monitoring.md`](../docs/uptime-monitoring.md)
