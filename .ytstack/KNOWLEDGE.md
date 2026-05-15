# Knowledge

Patterns, rules, and lessons learned while building SunoFlow. Future sessions read this first.

## Primary sources (read these, don't duplicate them)

- [`README.md`](../README.md) — setup, env-var reference, quick start
- [`FEATURE-MAP.md`](FEATURE-MAP.md) — bounded contexts, generation/playback flows, hot-spots, cross-cutting concerns (shape of the system; complements the inventory)
- [`docs/feature-inventory.md`](../docs/feature-inventory.md) — exhaustive feature list with file pointers (flat catalog)
- [`docs/deployment-runbook.md`](../docs/deployment-runbook.md) — Railway deploy flow, rollback, smoke checks
- [`docs/backup-runbook.md`](../docs/backup-runbook.md) — DB backup + restore via `scripts/backup-db.sh` / `restore-db.sh`
- [`docs/incident-response.md`](../docs/incident-response.md) — escalation playbook
- [`docs/sentry-alerting.md`](../docs/sentry-alerting.md) — error-budget thresholds + alert routing
- [`docs/uptime-monitoring.md`](../docs/uptime-monitoring.md) — uptime checks
- [`docs/secrets-rotation-runbook.md`](../docs/secrets-rotation-runbook.md) — quarterly rotation
- [`docs/MCP.md`](../docs/MCP.md) — MCP server entry (`mcp/server.ts`, `pnpm mcp`)

## Conventions

- **Package manager:** pnpm (Node 20+)
- **Framework:** Next.js 15 App Router, all routes under `src/app/[locale]/…`
- **Auth:** NextAuth.js v5 with Prisma adapter (`src/lib/auth.ts`)
- **ORM:** Prisma v5 against PostgreSQL 16
- **Validation:** Zod
- **Logging:** Pino (no `console.log` in production paths)
- **Errors:** Sentry — server runtime + `onRequestError` + replay stripping (see recent commits `fbae46a`, `f9ce935`)
- **i18n:** locale segment in URL (`[locale]`)
- **Public sharing:** opaque slugs at `/s/[slug]` (songs) and `/p/[slug]` (playlists)

## Lessons learned

- **Sentry Session Replay must be stripped when pointing at GlitchTip.** GlitchTip is Sentry-protocol-compatible but rejects Replay payloads. Drop `replayIntegration()` from any client config. (Memory: `reference_glitchtip_sentry_compat.md`)
- **Player async paths need a load-generation token.** Race conditions between rapid track switches caused stale-audio bugs — guarded by a generation token (commit `7511d20`).
- **Waveform peak math belongs in a Web Worker.** Main-thread blocking on long tracks; moved to worker (commit `45023a6`).
- **PostHog init deferred via `requestIdleCallback`.** Eager init hurts first-paint metrics (commit `c66bc2f`).

## Gotchas

- **Two DB URLs are required**: `SUNOFLOW_DATABASE_URL` AND `DATABASE_URL`. Prisma reads `DATABASE_URL`; the app reads `SUNOFLOW_DATABASE_URL` for connection pooling.
- **Docker build needs `NEXT_PUBLIC_SENTRY_DSN` as a build ARG** (commit `f9ce935`) — env-only injection is too late for the client bundle.
- **`prisma migrate deploy` runs as part of `pnpm dev`** — local dev assumes a reachable Postgres.
- **Audio + image caches** live under `AUDIO_CACHE_DIR` / `IMAGE_CACHE_DIR` — must be persistent volumes in production (Railway).
- **Production deploys are tag-driven** (`v*.*.*` push to `main` triggers `.github/workflows/deploy-production.yml` → Railway). Don't expect deploys on plain merges.
- **Paperclip company SUNAA tracks issue-level work separately** — see project memory `project_sunoflow_paperclip_company.md`. Don't double-track milestones here AND there for the same scope.
