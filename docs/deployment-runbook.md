# Deployment Runbook

## Environments

| Environment | Railway Service   | URL                                                  | Trigger                              |
|-------------|-------------------|------------------------------------------------------|--------------------------------------|
| Staging     | SunoFlow-staging  | https://sunoflow-staging.up.railway.app              | Auto — push to `main`                |
| Production  | SunoFlow          | https://sunoflow-production.up.railway.app           | Manual — `workflow_dispatch` or `v*` tag |

## Normal Deploy Flow

```
push to main
  → lint + typecheck + unit tests + build + local E2E  (qa job)
  → secrets scan                                        (secrets-scan job)
  → deploy to staging                                   (deploy-staging job)
  → E2E tests against staging URL                       (e2e-staging job)

[human validates staging, then:]
  → Actions → Deploy to Production → Run workflow       (workflow_dispatch)
  OR
  → git tag v1.2.3 && git push --tags                   (tag trigger)
```

Production deploys require a reviewer to approve the GitHub Environment (`production`).
Configure reviewers at **Settings → Environments → production → Required reviewers**.

## GitHub Secrets & Variables Required

### Environment: `staging`

| Name                  | Type     | Description                              |
|-----------------------|----------|------------------------------------------|
| `RAILWAY_TOKEN_STAGING` | Secret | Railway token scoped to staging service  |
| `STAGING_URL`           | Variable | Public URL of the staging service (e.g. `https://sunoflow-staging.up.railway.app`) |

### Environment: `production`

| Name                       | Type   | Description                                |
|----------------------------|--------|--------------------------------------------|
| `RAILWAY_TOKEN_PRODUCTION` | Secret | Railway token scoped to production service |

### Repository-level

| Name            | Type   | Description                      |
|-----------------|--------|----------------------------------|
| `GITHUB_TOKEN`  | Auto   | Used by Gitleaks secrets scan    |

## Staging E2E Notes

- E2E tests run against the deployed staging URL via `BASE_URL` + `PLAYWRIGHT_REMOTE=true`.
- The local dev server is **not** started for staging E2E.
- Auth flows that rely on `PLAYWRIGHT_TEST=true` (CSRF skip) require that env var to be set
  on the staging Railway service itself. Add it under **Railway → SunoFlow-staging → Variables**.

## Rollback Procedure

### Option 1 — Re-deploy a previous SHA (recommended)

```bash
# Find the last good SHA from git log or GitHub Actions history
git log --oneline main | head -10

# Trigger a production deploy for that SHA via GitHub Actions UI:
# Actions → Deploy to Production → Run workflow → enter SHA
```

### Option 2 — Railway dashboard re-deploy

1. Open [railway.app](https://railway.app) → SunoFlow project → Production service.
2. Click **Deployments** tab.
3. Find the last successful deployment.
4. Click the **⋯** menu → **Redeploy**.

### Option 3 — Railway CLI re-deploy

```bash
# List recent deployments
railway deployments --service SunoFlow

# Roll back to a specific deployment ID
railway rollback <deployment-id> --service SunoFlow
```

> **Note:** `railway rollback` re-activates a previous Docker image. Database migrations
> are NOT reversed — ensure the previous code is compatible with the current schema, or
> run a down-migration manually before rolling back.

## Database Migration Rollback

Prisma does not generate automatic down-migrations. To revert a migration:

1. Identify the migration to revert in `prisma/migrations/`.
2. Write and run a manual SQL script to reverse the schema change.
3. Mark it resolved in Prisma:
   ```bash
   railway run prisma migrate resolve --rolled-back <migration-name> --service SunoFlow
   ```
4. Re-deploy the previous application version.

## Checking Deploy Health

After any deploy, verify:

```bash
# Health check endpoint
curl https://<service-url>/api/health

# Recent logs
railway logs --service SunoFlow --tail 100
```

The health check path is `/api/health` (configured in `railway.toml`).

The health response includes:
- `db` — whether the Postgres connection is up
- `uptime` — seconds since process start
- `generation.queueDepth` — pending generation tasks (should stay near 0)
- `jobs` — scheduler status for each cron job

---

## Environment Variable Reference

All variables are set in Railway's **Variables** panel for each service/environment. The full list with defaults is in `.env.example` at the repo root.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string (used by the app) |
| `SUNOFLOW_DATABASE_URL` | Postgres connection string (used by Prisma CLI during migrations) |
| `AUTH_SECRET` | NextAuth JWT signing secret. Generate with `npx auth secret`. Rotating this logs out all users. |
| `AUTH_URL` | Public-facing app URL (e.g. `https://sunoflow.up.railway.app`). Must match exactly. |

### Music Generation

| Variable | Default | Description |
|----------|---------|-------------|
| `SUNOAPI_KEY` | — | Platform-level API key for sunoapi.org. Users can also supply their own in Settings. Omit for mock/demo mode. |
| `SUNO_API_TIMEOUT_MS` | `30000` | Timeout in ms for Suno API calls |

### Auth Providers

| Variable | Description |
|----------|-------------|
| `AUTH_GOOGLE_ID` | Google OAuth client ID. Sign-in button is hidden when unset. |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |

### AI / LLM

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Required for lyrics generation, prompt suggestions, and embedding-based recommendations |
| `OPENAI_MODEL` | `gpt-4o-mini` | Override the default LLM model |

### Billing (Stripe)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key (server-side) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (client-side) |
| `STRIPE_WEBHOOK_SECRET` | Webhook endpoint signing secret |
| `STRIPE_PRICE_STARTER` / `_PRO` / `_STUDIO` | Price IDs for subscription tiers |
| `STRIPE_PRICE_TOPUP_10` / `_25` / `_50` | Credit top-up price IDs |

### Email (Mailjet)

| Variable | Description |
|----------|-------------|
| `MAILJET_API_KEY` | Mailjet API key. Omit to log emails to console instead. |
| `MAILJET_SECRET_KEY` | Mailjet secret key |
| `EMAIL_FROM` | Sender address (e.g. `noreply@sunoflow.com`) |

### Web Push (VAPID)

| Variable | Description |
|----------|-------------|
| `VAPID_PUBLIC_KEY` | VAPID public key. Generate: `node -e "const wp=require('web-push');console.log(wp.generateVAPIDKeys())"` |
| `VAPID_PRIVATE_KEY` | VAPID private key |
| `VAPID_SUBJECT` | Contact URI (e.g. `mailto:noreply@sunoflow.app`) |

### Observability

| Variable | Default | Description |
|----------|---------|-------------|
| `SENTRY_DSN` | — | Sentry DSN for server-side error tracking. Omit to disable. |
| `NEXT_PUBLIC_SENTRY_DSN` | — | Sentry DSN for client-side error tracking |
| `SENTRY_ENVIRONMENT` | `NODE_ENV` | Override environment tag (e.g. `production`, `staging`) |
| `SENTRY_RELEASE` | auto (Railway) | Release tag for source map association |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | — | Required to upload source maps during build |
| `LOG_LEVEL` | `info` (prod) | `trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal` |
| `LOG_PRETTY` | `false` | Set to `true` in development for human-readable log output |

### Analytics

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key. Omit to disable analytics. |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog ingest host (default: `https://us.i.posthog.com`) |

### Cron / Scheduled Jobs

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Bearer token for authenticating cron requests. Generate: `openssl rand -hex 32` |

### Misc

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SITE_URL` | — | Public base URL for Open Graph, sitemaps, and share links |
| `ALLOWED_ORIGINS` | same-origin | Comma-separated CORS allowed origins |
| `RATE_LIMIT_MAX_GENERATIONS` | `10` | Max AI generation requests per user per rate-limit window |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_CLIENT_TOKEN` | — | Required for Instagram oEmbed on the Inspire page |
