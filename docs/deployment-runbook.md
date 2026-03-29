# Deployment Runbook

## Environments

| Environment | Railway Service   | Trigger                              |
|-------------|-------------------|--------------------------------------|
| Staging     | SunoFlow-staging  | Auto — push to `main`                |
| Production  | SunoFlow          | Manual — `workflow_dispatch` or `v*` tag |

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
